const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Adjust path as needed

// Define role hierarchy and permissions
const ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant'
};

const PERMISSIONS = {
  // Financial operations
  VIEW_FINANCIAL_DATA: 'view_financial_data',
  EDIT_FINANCIAL_DATA: 'edit_financial_data',
  DELETE_FINANCIAL_DATA: 'delete_financial_data',
  EXPORT_FINANCIAL_DATA: 'export_financial_data',
  
  // User management
  VIEW_USERS: 'view_users',
  CREATE_USERS: 'create_users',
  EDIT_USERS: 'edit_users',
  DELETE_USERS: 'delete_users',
  
  // System configuration
  VIEW_SYSTEM_CONFIG: 'view_system_config',
  EDIT_SYSTEM_CONFIG: 'edit_system_config',
  MANAGE_ROLES: 'manage_roles',
  
  // General operations
  VIEW_REPORTS: 'view_reports',
  CREATE_REPORTS: 'create_reports',
  EDIT_REPORTS: 'edit_reports'
};

// Role-permission mapping
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    // Full access to everything
    ...Object.values(PERMISSIONS)
  ],
  [ROLES.ASSISTANT]: [
    // Limited access - can view and create but not delete or manage system
    PERMISSIONS.VIEW_FINANCIAL_DATA,
    PERMISSIONS.EDIT_FINANCIAL_DATA,
    PERMISSIONS.VIEW_USERS,
    PERMISSIONS.VIEW_REPORTS,
    PERMISSIONS.CREATE_REPORTS,
    PERMISSIONS.EDIT_REPORTS
  ]
};

/**
 * Middleware to verify JWT token and extract user information
 */
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token required'
      });
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // Fetch user from database to get current role and status
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'Account has been deactivated'
      });
    }

    // Validate role
    if (!Object.values(ROLES).includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid user role'
      });
    }

    // Attach user info to request
    req.user = {
      id: user._id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role] || []
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired'
      });
    }

    console.error('Authentication error:', error);
    
    // More detailed logging in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Full error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Middleware to require authentication
 */
const requireAuth = () => {
  return authenticateToken;
};

/**
 * Middleware to require admin role
 */
const requireAdmin = () => {
  return [
    authenticateToken,
    (req, res, next) => {
      if (req.user.role !== ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }
      next();
    }
  ];
};

/**
 * Middleware to require assistant role or admin (both roles allowed)
 */
const requireAssistant = () => {
  return [
    authenticateToken,
    (req, res, next) => {
      const allowedRoles = [ROLES.ADMIN, ROLES.ASSISTANT];
      
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Assistant or Admin access required'
        });
      }
      next();
    }
  ];
};

/**
 * Middleware to check specific permission
 */
const checkPermission = (requiredPermission) => {
  return [
    authenticateToken,
    (req, res, next) => {
      if (!req.user.permissions.includes(requiredPermission)) {
        return res.status(403).json({
          success: false,
          message: `Permission required: ${requiredPermission}`
        });
      }
      next();
    }
  ];
};

/**
 * Middleware to check multiple permissions (user must have ALL)
 */
const checkPermissions = (requiredPermissions) => {
  return [
    authenticateToken,
    (req, res, next) => {
      const hasAllPermissions = requiredPermissions.every(permission => 
        req.user.permissions.includes(permission)
      );

      if (!hasAllPermissions) {
        return res.status(403).json({
          success: false,
          message: `Missing required permissions: ${requiredPermissions.join(', ')}`
        });
      }
      next();
    }
  ];
};

/**
 * Middleware to check if user has any of the specified permissions
 */
const checkAnyPermission = (permissionOptions) => {
  return [
    authenticateToken,
    (req, res, next) => {
      const hasAnyPermission = permissionOptions.some(permission => 
        req.user.permissions.includes(permission)
      );

      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: `One of these permissions required: ${permissionOptions.join(', ')}`
        });
      }
      next();
    }
  ];
};

/**
 * Middleware for resource ownership check
 * Allows access if user is admin or owns the resource
 */
const requireOwnershipOrAdmin = (getResourceOwnerId) => {
  return [
    authenticateToken,
    async (req, res, next) => {
      try {
        // Admin can access anything
        if (req.user.role === ROLES.ADMIN) {
          return next();
        }

        // Get the resource owner ID
        const ownerId = await getResourceOwnerId(req);
        
        if (req.user.id.toString() !== ownerId.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: You can only access your own resources'
          });
        }

        next();
      } catch (error) {
        console.error('Ownership check error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error checking resource ownership'
        });
      }
    }
  ];
};

/**
 * Utility function to check if user has permission
 */
const hasPermission = (user, permission) => {
  return user.permissions && user.permissions.includes(permission);
};

/**
 * Utility function to check if user has role
 */
const hasRole = (user, role) => {
  return user.role === role;
};

/**
 * Utility function to check if user has any of the specified roles
 */
const hasAnyRole = (user, roles) => {
  return roles.includes(user.role);
};

/**
 * Middleware for conditional access based on request context
 */
const conditionalAccess = (conditionFn) => {
  return [
    authenticateToken,
    async (req, res, next) => {
      try {
        const hasAccess = await conditionFn(req.user, req);
        
        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: 'Access denied based on current context'
          });
        }

        next();
      } catch (error) {
        console.error('Conditional access error:', error);
        return res.status(500).json({
          success: false,
          message: 'Error evaluating access conditions'
        });
      }
    }
  ];
};

module.exports = {
  // Core middleware functions
  requireAuth,
  requireAdmin,
  requireAssistant,
  checkPermission,
  checkPermissions,
  checkAnyPermission,
  requireOwnershipOrAdmin,
  conditionalAccess,
  
  // Utility functions
  hasPermission,
  hasRole,
  hasAnyRole,
  
  // Constants
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  
  // Direct access to internal functions for testing
  authenticateToken
};