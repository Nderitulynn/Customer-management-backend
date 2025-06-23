// backend/middleware/auth.js
const passport = require('passport');
const { jwtStrategy } = require('../config/jwt');

// Initialize Passport JWT strategy
passport.use('jwt', jwtStrategy);

// Basic authentication middleware
const requireAuth = () => {
  return passport.authenticate('jwt', { session: false });
};

// Admin role required middleware
const requireAdmin = () => {
  return [
    requireAuth(),
    (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
      }

      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin role required.'
        });
      }

      next();
    }
  ];
};

// Assistant role or higher middleware
const requireAssistant = () => {
  return [
    requireAuth(),
    (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
      }

      if (!['admin', 'assistant'].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Assistant role or higher required.'
        });
      }

      next();
    }
  ];
};

// Active user required middleware
const requireActiveUser = () => {
  return [
    requireAuth(),
    (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
      }

      if (!req.user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. User account is inactive.'
        });
      }

      next();
    }
  ];
};

// Permission middleware for specific resources
const checkPermission = (resource, action) => {
  return [
    requireAuth(),
    (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
      }

      // Define permission matrix
      const permissions = {
        admin: {
          users: ['create', 'read', 'update', 'delete'],
          customers: ['create', 'read', 'update', 'delete'],
          orders: ['create', 'read', 'update', 'delete'],
          reports: ['read']
        },
        assistant: {
          customers: ['create', 'read', 'update'],
          orders: ['create', 'read', 'update']
        }
      };

      const userPermissions = permissions[req.user.role];
      if (!userPermissions || !userPermissions[resource] || !userPermissions[resource].includes(action)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Insufficient permissions for ${action} on ${resource}.`
        });
      }

      next();
    }
  ];
};

// Generic role-based access control
const authorize = (...roles) => {
  return [
    requireAuth(),
    (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not authenticated.'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Requires ${roles.join(' or ')} role.`
        });
      }

      next();
    }
  ];
};

// Error handling middleware for authentication
const handleAuthError = (err, req, res, next) => {
  if (err.name === 'AuthenticationError') {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired'
    });
  }

  next(err);
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireAssistant,
  requireActiveUser,
  checkPermission,
  authorize,
  handleAuthError
};