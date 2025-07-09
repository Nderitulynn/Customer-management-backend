const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Define role hierarchy - matches your requirements
const ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant'
};

// Define permissions based on your actual requirements
const PERMISSIONS = {
  // Customer management
  CREATE_CUSTOMER: 'create_customer',
  READ_CUSTOMER: 'read_customer',
  UPDATE_CUSTOMER: 'update_customer',
  DELETE_CUSTOMER: 'delete_customer',
  
  // Order management
  CREATE_ORDER: 'create_order',
  READ_ORDER: 'read_order',
  UPDATE_ORDER: 'update_order',
  DELETE_ORDER: 'delete_order',
  
  // User management
  CREATE_USER: 'create_user',
  READ_USER: 'read_user',
  UPDATE_USER: 'update_user',
  DELETE_USER: 'delete_user',
  
  // Financial data
  READ_FINANCIAL: 'read_financial',
  
  // System administration
  ADMIN_DASHBOARD: 'admin_dashboard',
  ASSISTANT_DASHBOARD: 'assistant_dashboard'
};

// Role-permission mapping
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    PERMISSIONS.CREATE_CUSTOMER,
    PERMISSIONS.READ_CUSTOMER,
    PERMISSIONS.UPDATE_CUSTOMER,
    PERMISSIONS.DELETE_CUSTOMER,
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.READ_ORDER,
    PERMISSIONS.UPDATE_ORDER,
    PERMISSIONS.DELETE_ORDER,
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.READ_USER,
    PERMISSIONS.UPDATE_USER,
    PERMISSIONS.DELETE_USER,
    PERMISSIONS.READ_FINANCIAL,
    PERMISSIONS.ADMIN_DASHBOARD
  ],
  [ROLES.ASSISTANT]: [
    PERMISSIONS.READ_CUSTOMER,
    PERMISSIONS.UPDATE_CUSTOMER,
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.READ_ORDER,
    PERMISSIONS.UPDATE_ORDER,
    PERMISSIONS.ASSISTANT_DASHBOARD
  ]
};

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Ensure JWT_SECRET is provided
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error('JWT_SECRET is not configured');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error'
      });
    }

    const decoded = jwt.verify(token, jwtSecret);
    
    // Handle both 'id' and 'userId' for backward compatibility
    const userId = decoded.id || decoded.userId;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    
    const user = await User.findById(userId).select('-password -refreshToken');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token - user not found'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account deactivated'
      });
    }

    // Validate role
    if (!Object.values(ROLES).includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid user role'
      });
    }

    // Attach user and permissions to request
    req.user = user;
    req.user.permissions = ROLE_PERMISSIONS[user.role] || [];

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Role-based access control middleware
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userRole = req.user.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role(s): ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
};

// Permission-based access control middleware
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${permission}`
      });
    }

    next();
  };
};

// Multiple permissions middleware
const requirePermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const userPermissions = req.user.permissions || [];
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasAllPermissions) {
      return res.status(403).json({
        success: false,
        message: `Insufficient permissions. Required: ${requiredPermissions.join(', ')}`
      });
    }

    next();
  };
};

// Specific role middleware
const requireAdmin = () => requireRole(ROLES.ADMIN);
const requireAssistant = () => requireRole(ROLES.ASSISTANT);
const requireAdminOrAssistant = () => requireRole([ROLES.ADMIN, ROLES.ASSISTANT]);

// Resource ownership middleware for assistants
const requireOwnership = (resourceKey = 'id', resourceModel = null) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      // Admins can access all resources
      if (user.role === ROLES.ADMIN) {
        return next();
      }
      
      // For assistants, check ownership
      if (user.role === ROLES.ASSISTANT) {
        const resourceId = req.params[resourceKey];
        
        if (!resourceId) {
          return res.status(400).json({
            success: false,
            message: 'Resource ID is required'
          });
        }
        
        // If a resource model is provided, check ownership
        if (resourceModel) {
          const Resource = require(`../models/${resourceModel}`);
          const resource = await Resource.findById(resourceId);
          
          if (!resource) {
            return res.status(404).json({
              success: false,
              message: 'Resource not found'
            });
          }
          
          // Check if resource belongs to the user
          // Adjust the ownership field based on your data model
          if (resource.createdBy && resource.createdBy.toString() !== user._id.toString()) {
            return res.status(403).json({
              success: false,
              message: 'Access denied - resource not owned by user'
            });
          }
        }
        
        return next();
      }
      
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking resource ownership'
      });
    }
  };
};

// Financial data access middleware
const requireFinancialAccess = () => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    // Only admins can access financial data
    if (req.user.role !== ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Access to financial data restricted to administrators'
      });
    }

    next();
  };
};

// Validate JWT Secret on startup
const validateJWTSecret = () => {
  if (!process.env.JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is not set');
    process.exit(1);
  }
  
  if (process.env.JWT_SECRET.length < 32) {
    console.warn('WARNING: JWT_SECRET should be at least 32 characters long');
  }
};

// Optional: Call this when your server starts
// validateJWTSecret();

module.exports = {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  authenticateToken,
  requireRole,
  requirePermission,
  requirePermissions,
  requireAdmin,
  requireAssistant,
  requireAdminOrAssistant,
  requireOwnership,
  requireFinancialAccess,
  validateJWTSecret
};