// middleware/reportAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { USER_ROLES } = require('../models/User');

/**
 * Role-based access control for reports
 * Ensures only authorized users can access report endpoints
 */
const requireReportAccess = (allowedRoles = [USER_ROLES.ADMIN, USER_ROLES.ASSISTANT]) => {
  return async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. No token provided.'
        });
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid token. User not found.'
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated.'
        });
      }

      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access reports.'
        });
      }

      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token.',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};

/**
 * Admin-only report access validation
 * Restricts sensitive reports to admin users only
 */
const requireAdminAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.'
      });
    }

    if (req.user.role !== USER_ROLES.ADMIN) {
      return res.status(403).json({
        success: false,
        message: 'Admin access required for this report.'
      });
    }

    // Log admin report access for audit trail
    console.log(`Admin report access: ${req.user.email} accessing ${req.path} at ${new Date().toISOString()}`);
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error validating admin access.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * API key validation for automated reports
 * Allows external systems to access reports via API keys
 */
const validateAPIKey = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key');
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required for automated report access.'
      });
    }

    // Validate API key format and hash
    const expectedApiKey = process.env.REPORT_API_KEY;
    if (!expectedApiKey) {
      return res.status(500).json({
        success: false,
        message: 'Report API key not configured.'
      });
    }

    if (apiKey !== expectedApiKey) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key.'
      });
    }

    // Set automated user context for logging
    req.user = {
      id: 'automated-system',
      email: 'system@automated.reports',
      role: USER_ROLES.ADMIN,
      isAutomated: true
    };

    // Log API key usage
    console.log(`API key report access: ${req.path} at ${new Date().toISOString()}`);
    
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error validating API key.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Combined authentication middleware
 * Checks for either JWT token or API key
 */
const authenticateReportAccess = async (req, res, next) => {
  const apiKey = req.header('X-API-Key');
  const authToken = req.header('Authorization');

  // If API key is provided, use API key validation
  if (apiKey) {
    return validateAPIKey(req, res, next);
  }

  // Otherwise, use standard JWT authentication
  if (authToken) {
    return requireReportAccess([USER_ROLES.ADMIN, USER_ROLES.ASSISTANT])(req, res, next);
  }

  return res.status(401).json({
    success: false,
    message: 'Authentication required. Provide either Authorization token or X-API-Key header.'
  });
};

/**
 * Rate limiting for report exports
 * Prevents abuse of resource-intensive operations
 */
const rateLimitReportExports = (maxExports = 5, windowMs = 60000) => {
  const exportCounts = new Map();

  return (req, res, next) => {
    const userId = req.user?.id || req.ip;
    const now = Date.now();
    
    // Clean old entries
    for (const [key, data] of exportCounts.entries()) {
      if (now - data.firstRequest > windowMs) {
        exportCounts.delete(key);
      }
    }

    const userExports = exportCounts.get(userId);
    
    if (!userExports) {
      exportCounts.set(userId, {
        count: 1,
        firstRequest: now
      });
      return next();
    }

    if (userExports.count >= maxExports) {
      return res.status(429).json({
        success: false,
        message: `Export limit exceeded. Maximum ${maxExports} exports per minute.`,
        retryAfter: Math.ceil((windowMs - (now - userExports.firstRequest)) / 1000)
      });
    }

    userExports.count++;
    next();
  };
};

/**
 * Report access logging middleware
 * Logs all report access for audit purposes
 */
const logReportAccess = (req, res, next) => {
  const startTime = Date.now();
  
  const logData = {
    userId: req.user?.id,
    email: req.user?.email,
    role: req.user?.role,
    isAutomated: req.user?.isAutomated || false,
    endpoint: req.path,
    method: req.method,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  };

  // Log request
  console.log('Report Access:', JSON.stringify(logData, null, 2));

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(data) {
    const endTime = Date.now();
    console.log('Report Response:', {
      ...logData,
      responseTime: endTime - startTime,
      status: res.statusCode,
      success: data?.success || false
    });
    
    return originalJson.call(this, data);
  };

  next();
};

module.exports = {
  requireReportAccess,
  requireAdminAccess,
  validateAPIKey,
  authenticateReportAccess,
  rateLimitReportExports,
  logReportAccess
};