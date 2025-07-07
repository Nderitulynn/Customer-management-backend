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
  CREATE_CUSTOMERS: 'create_customers',
  VIEW_CUSTOMERS: 'view_customers',
  UPDATE_CUSTOMERS: 'update_customers',
  DELETE_CUSTOMERS: 'delete_customers',
  
  // Order management
  CREATE_ORDERS: 'create_orders',
  VIEW_ORDERS: 'view_orders',
  UPDATE_ORDERS: 'update_orders',
  DELETE_ORDERS: 'delete_orders',
  
  // User management (only admins)
  CREATE_USERS: 'create_users',
  VIEW_USERS: 'view_users',
  UPDATE_USERS: 'update_users',
  DELETE_USERS: 'delete_users',
  
  // Financial data (only admins)
  VIEW_FINANCIAL_DATA: 'view_financial_data',
  
  // System operations
  VIEW_REPORTS: 'view_reports',
  EXPORT_DATA: 'export_data'
};

// Role-permission mapping that matches your requirements
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    // Full access to everything
    ...Object.values(PERMISSIONS)
  ],
  [ROLES.ASSISTANT]: [
    // Limited access based on your requirements:
    // - Can create/update customers but NOT delete
    PERMISSIONS.CREATE_CUSTOMERS,
    PERMISSIONS.VIEW_CUSTOMERS,
    PERMISSIONS.UPDATE_CUSTOMERS,
    // NOTE: NO DELETE_CUSTOMERS permission
    
    // - Can create/update orders but NOT delete
    PERMISSIONS.CREATE_ORDERS,
    PERMISSIONS.VIEW_ORDERS,
    PERMISSIONS.UPDATE_ORDERS,
    // NOTE: NO DELETE_ORDERS permission
    
    // - Can view reports
    PERMISSIONS.VIEW_REPORTS,
    
    // NOTE: NO user management permissions
    // NOTE: NO financial data permissions
    // NOTE: NO system configuration permissions
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

    // Attach user info to request - FIXED: Using exact field names from User model
    req.user = {
      id: user._id,
      firstName: user.firstName,  // ✅ Matches User model
      lastName: user.lastName,    // ✅ Matches User model
      email: user.email,
      fullName: user.fullName,    // ✅ Virtual field from User model
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
 * Middleware for resource ownership check
 * CRITICAL: Assistants can only access their own customers/orders
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

        // For assistants, verify they own the resource
        if (req.user.role === ROLES.ASSISTANT) {
          const ownerId = await getResourceOwnerId(req);
          
          if (req.user.id.toString() !== ownerId.toString()) {
            return res.status(403).json({
              success: false,
              message: 'Access denied: You can only access your own customers/orders'
            });
          }
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
 * Middleware to filter database queries for assistants
 * CRITICAL: Ensures assistants only see their own data
 */
const addOwnershipFilter = (req, res, next) => {
  if (req.user.role === ROLES.ASSISTANT) {
    // Add ownership filter to database queries
    req.ownershipFilter = { createdBy: req.user.id };
  }
  next();
};

/**
 * Middleware to prevent financial data access for assistants
 */
const restrictFinancialAccess = (req, res, next) => {
  if (req.user.role === ROLES.ASSISTANT) {
    // Flag to filter financial data from responses
    req.restrictFinancialData = true;
  }
  next();
};

/**
 * Utility function to check if user has permission
 */
const hasPermission = (user, permission) => {
  return user.permissions && user.permissions.includes(permission);
};

/**
 * Utility function to check if user can delete resources
 */
const canDelete = (user) => {
  return user.role === ROLES.ADMIN;
};

/**
 * Utility function to check if user can access financial data
 */
const canAccessFinancialData = (user) => {
  return user.role === ROLES.ADMIN;
};

/**
 * Utility function to check if user can manage other users
 */
const canManageUsers = (user) => {
  return user.role === ROLES.ADMIN;
};

module.exports = {
  // Core middleware functions
  requireAuth,
  requireAdmin,
  requireAssistant,
  checkPermission,
  requireOwnershipOrAdmin,
  addOwnershipFilter,
  restrictFinancialAccess,
  
  // Utility functions
  hasPermission,
  canDelete,
  canAccessFinancialData,
  canManageUsers,
  
  // Constants
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  
  // Direct access to internal functions
  authenticateToken
};