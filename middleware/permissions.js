// middleware/permissions.js
const { USER_ROLES, OPERATIONS, ENTITIES } = require('../utils/constants');
const { logCustomerAccess, logUnauthorizedAccess } = require('../utils/auditLogger');

// Entity-based permission matrix
const PERMISSION_MATRIX = {
  [USER_ROLES.ADMIN]: {
    [ENTITIES.CUSTOMERS]: [OPERATIONS.CREATE, OPERATIONS.READ, OPERATIONS.UPDATE, OPERATIONS.DELETE],
    [ENTITIES.ORDERS]: [OPERATIONS.CREATE, OPERATIONS.READ, OPERATIONS.UPDATE, OPERATIONS.DELETE],
    [ENTITIES.USERS]: [OPERATIONS.CREATE, OPERATIONS.READ, OPERATIONS.UPDATE, OPERATIONS.DELETE],
    [ENTITIES.FINANCIAL_DATA]: [OPERATIONS.READ]
  },
  [USER_ROLES.ASSISTANT]: {
    [ENTITIES.CUSTOMERS]: [OPERATIONS.CREATE, OPERATIONS.READ, OPERATIONS.UPDATE], // No DELETE
    [ENTITIES.ORDERS]: [OPERATIONS.CREATE, OPERATIONS.READ, OPERATIONS.UPDATE],
    [ENTITIES.USERS]: [], // Cannot manage users
    [ENTITIES.FINANCIAL_DATA]: [] // Cannot access financial data
  }
};

/**
 * Check if user has permission for specific entity and operation
 */
function hasPermission(userRole, entity, operation) {
  if (!userRole || !entity || !operation) {
    return false;
  }

  const permissions = PERMISSION_MATRIX[userRole];
  if (!permissions || !permissions[entity]) {
    return false;
  }

  return permissions[entity].includes(operation);
}

/**
 * Check if user can access specific resource (data ownership logic)
 */
function canAccessResource(userRole, userId, resourceOwnerId) {
  // Admin can access all resources
  if (userRole === USER_ROLES.ADMIN) {
    return true;
  }
  
  // Assistant can only access their own resources
  if (userRole === USER_ROLES.ASSISTANT) {
    return userId === resourceOwnerId;
  }
  
  return false;
}

/**
 * Middleware to check entity-based permissions
 */
function requirePermission(entity, operation) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    // Check basic permission
    if (!hasPermission(userRole, entity, operation)) {
      logUnauthorizedAccess(userId, `Attempted ${operation} on ${entity} without permission`);
      return res.status(403).json({ 
        error: `Not authorized to perform ${operation} on ${entity}` 
      });
    }

    // For assistants, add ownership filter to request
    if (userRole === USER_ROLES.ASSISTANT) {
      req.ownershipFilter = { createdBy: userId };
    }

    // Log the access attempt
    if (req.params.customerId) {
      logCustomerAccess(userId, req.params.customerId, operation, userRole);
    }

    next();
  };
}

/**
 * Middleware to check resource ownership for specific resources
 */
function checkResourceOwnership(entity) {
  return async (req, res, next) => {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    
    // Admin can access all resources
    if (userRole === USER_ROLES.ADMIN) {
      return next();
    }
    
    // For assistants, verify they own the resource
    if (userRole === USER_ROLES.ASSISTANT) {
      const resourceId = req.params.customerId || req.params.orderId || req.params.id;
      
      if (resourceId) {
        // This would need to be implemented with actual database queries
        // For now, we'll add the ownership requirement to the request
        req.requireOwnership = true;
        req.resourceOwnerId = userId;
      }
    }
    
    next();
  };
}

/**
 * Filter financial data from responses for assistants
 */
function filterFinancialData(data, userRole) {
  if (userRole === USER_ROLES.ADMIN) {
    return data;
  }
  
  const financialFields = [
    'creditLimit', 
    'paymentTerms', 
    'balance', 
    'revenue',
    'totalSpent',
    'outstandingBalance',
    'creditScore',
    'paymentHistory'
  ];
  
  if (Array.isArray(data)) {
    return data.map(item => removeFinancialFields(item, financialFields));
  } else {
    return removeFinancialFields(data, financialFields);
  }
}

/**
 * Remove financial fields from object
 */
function removeFinancialFields(obj, fieldsToRemove) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }
  
  const filtered = { ...obj };
  fieldsToRemove.forEach(field => {
    delete filtered[field];
  });
  
  return filtered;
}

/**
 * Middleware to filter response data
 */
function filterResponse(entity) {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    // Override res.json to filter data before sending
    const originalJson = res.json;
    res.json = function(data) {
      // Filter financial data for assistants
      if (userRole === USER_ROLES.ASSISTANT && 
          (entity === ENTITIES.CUSTOMERS || entity === ENTITIES.ORDERS)) {
        data = filterFinancialData(data, userRole);
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
}

/**
 * Check if user can register other users (only admins)
 */
function canRegisterUsers(userRole) {
  return userRole === USER_ROLES.ADMIN;
}

/**
 * Middleware to restrict user registration to admins only
 */
function requireAdminForUserRegistration() {
  return (req, res, next) => {
    const userRole = req.user?.role;
    
    if (!canRegisterUsers(userRole)) {
      logUnauthorizedAccess(req.user?.id, 'Attempted user registration without admin privileges');
      return res.status(403).json({ 
        error: 'Only administrators can register new users' 
      });
    }
    
    next();
  };
}

/**
 * Legacy compatibility functions
 */
function validateRoleForOperation(userRole, operation) {
  // This is kept for backward compatibility
  // In new system, use hasPermission instead
  return hasPermission(userRole, 'customers', operation);
}

function hasAdminAccess(userRole) {
  return userRole === USER_ROLES.ADMIN;
}

function extractUserRole(req) {
  return req.user?.role || null;
}

module.exports = {
  PERMISSION_MATRIX,
  hasPermission,
  canAccessResource,
  requirePermission,
  checkResourceOwnership,
  filterFinancialData,
  filterResponse,
  canRegisterUsers,
  requireAdminForUserRegistration,
  
  // Legacy compatibility
  validateRoleForOperation,
  hasAdminAccess,
  extractUserRole
};