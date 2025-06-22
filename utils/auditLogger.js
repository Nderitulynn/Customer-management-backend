const AUDIT_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  SEARCH: 'search'
};

function logCustomerAccess(userId, customerId, action, userRole) {
  const logEntry = createAuditEntry({
    userId,
    customerId,
    action,
    userRole,
    type: 'access',
    timestamp: new Date(),
    details: `Customer ${action} by ${userRole}`
  });

  // In a real application, this would save to database
  console.log('Audit Log:', logEntry);
  return logEntry;
}

function logCustomerModification(userId, customerId, changes, userRole) {
  const logEntry = createAuditEntry({
    userId,
    customerId,
    action: AUDIT_ACTIONS.UPDATE,
    userRole,
    type: 'modification',
    timestamp: new Date(),
    changes: sanitizeChanges(changes),
    details: `Customer modified by ${userRole}`
  });

  console.log('Audit Log:', logEntry);
  return logEntry;
}

function logSearchActivity(userId, searchQuery, resultsCount, userRole) {
  const logEntry = createAuditEntry({
    userId,
    action: AUDIT_ACTIONS.SEARCH,
    userRole,
    type: 'search',
    timestamp: new Date(),
    searchQuery: sanitizeSearchQuery(searchQuery),
    resultsCount,
    details: `Search performed by ${userRole}`
  });

  console.log('Audit Log:', logEntry);
  return logEntry;
}

function createAuditEntry(logData) {
  const baseEntry = {
    id: generateAuditId(),
    timestamp: new Date(),
    userId: logData.userId,
    userRole: logData.userRole,
    action: logData.action,
    type: logData.type,
    details: logData.details
  };

  // Add specific fields based on log type
  if (logData.customerId) {
    baseEntry.customerId = logData.customerId;
  }

  if (logData.changes) {
    baseEntry.changes = logData.changes;
  }

  if (logData.searchQuery) {
    baseEntry.searchQuery = logData.searchQuery;
    baseEntry.resultsCount = logData.resultsCount;
  }

  return baseEntry;
}

function getAuditTrail(customerId) {
  // In a real application, this would query the database
  // For now, return a mock structure
  return {
    customerId,
    logs: [
      {
        id: 'audit_001',
        timestamp: new Date(),
        action: AUDIT_ACTIONS.CREATE,
        userId: 'user_123',
        userRole: 'ADMIN',
        details: 'Customer created'
      }
    ]
  };
}

function sanitizeChanges(changes) {
  if (!changes || typeof changes !== 'object') {
    return {};
  }

  const sanitized = {};
  Object.keys(changes).forEach(key => {
    if (typeof changes[key] === 'string') {
      sanitized[key] = changes[key].substring(0, 255); // Limit string length
    } else {
      sanitized[key] = changes[key];
    }
  });

  return sanitized;
}

function sanitizeSearchQuery(query) {
  if (typeof query === 'string') {
    return query.substring(0, 100); // Limit search query length
  }
  return query;
}

function generateAuditId() {
  return 'audit_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

module.exports = {
  AUDIT_ACTIONS,
  logCustomerAccess,
  logCustomerModification,
  logSearchActivity,
  createAuditEntry,
  getAuditTrail
};