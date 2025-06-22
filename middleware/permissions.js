/ File 7: middleware/rolePermissions.js
const { ROLES } = require('../utils/roleBasedFilter');
const { logCustomerAccess } = require('../utils/auditLogger');

const OPERATIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  SEARCH: 'search'
};

const PERMISSION_MATRIX = {
  [ROLES.ADMIN]: {
    [OPERATIONS.CREATE]: true,
    [OPERATIONS.READ]: true,
    [OPERATIONS.UPDATE]: true,
    [OPERATIONS.DELETE]: true,
    [OPERATIONS.SEARCH]: true
  },
  [ROLES.ASSISTANT]: {
    [OPERATIONS.CREATE]: true,
    [OPERATIONS.READ]: true,
    [OPERATIONS.UPDATE]: true,
    [OPERATIONS.DELETE]: false,
    [OPERATIONS.SEARCH]: true
  }
};

function checkCustomerAccess(requiredRole) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    if (!userRole) {
      logUnauthorizedAccess(req.user?.id, 'No role provided');
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (requiredRole && userRole !== requiredRole && userRole !== ROLES.ADMIN) {
      logUnauthorizedAccess(req.user.id, `Insufficient role: ${userRole}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

function validateRoleForOperation(userRole, operation) {
  if (!userRole || !operation) {
    return false;
  }

  const permissions = PERMISSION_MATRIX[userRole];
  if (!permissions) {
    return false;
  }

  return permissions[operation] === true;
}

function restrictFinancialData(userRole) {
  return (req, res, next) => {
    if (userRole === ROLES.ASSISTANT) {
      // Add flag to request to filter financial data in response
      req.restrictFinancialData = true;
    }
    next();
  };
}

function logUnauthorizedAccess(userId, attemptedAction) {
  const logEntry = {
    userId: userId || 'unknown',
    action: 'UNAUTHORIZED_ACCESS',
    timestamp: new Date(),
    attemptedAction,
    severity: 'HIGH'
  };

  console.warn('Security Alert:', logEntry);
  
  // In a real application, this would save to security logs
  return logEntry;
}

function requirePermission(operation) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    if (!validateRoleForOperation(userRole, operation)) {
      logUnauthorizedAccess(req.user?.id, `Attempted ${operation} without permission`);
      return res.status(403).json({ 
        error: `Not authorized to perform ${operation} operation` 
      });
    }

    // Log the access
    if (req.params.customerId) {
      logCustomerAccess(req.user.id, req.params.customerId, operation, userRole);
    }

    next();
  };
}

function extractUserRole(req) {
  return req.user?.role || null;
}

function hasAdminAccess(userRole) {
  return userRole === ROLES.ADMIN;
}

module.exports = {
  OPERATIONS,
  PERMISSION_MATRIX,
  checkCustomerAccess,
  validateRoleForOperation,
  restrictFinancialData,
  logUnauthorizedAccess,
  requirePermission,
  extractUserRole,
  hasAdminAccess
};