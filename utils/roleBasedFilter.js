const ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant'
};

const ROLE_FIELDS = {
  [ROLES.ADMIN]: [
    'id', 'name', 'email', 'phone', 'address', 'dateCreated', 
    'lastLogin', 'status', 'totalSpent', 'orderHistory', 'notes',
    'amountPaid', 'remainingBalance', 'analytics'
  ],
  [ROLES.ASSISTANT]: [
    'id', 'name', 'email', 'phone', 'address', 'dateCreated', 
    'lastLogin', 'status', 'orderHistory', 'notes',
    'amountPaid', 'remainingBalance'
  ]
};

function filterCustomerData(customer, userRole) {
  if (!customer || typeof customer !== 'object') {
    return null;
  }

  const allowedFields = ROLE_FIELDS[userRole] || [];
  const filteredCustomer = {};

  allowedFields.forEach(field => {
    if (customer.hasOwnProperty(field)) {
      filteredCustomer[field] = customer[field];
    }
  });

  return filteredCustomer;
}

function filterCustomerList(customers, userRole) {
  if (!Array.isArray(customers)) {
    return [];
  }

  return customers.map(customer => filterCustomerData(customer, userRole))
                 .filter(customer => customer !== null);
}

function canAccessFinancialData(userRole) {
  return userRole === ROLES.ADMIN;
}

function filterOrderHistory(orders, userRole) {
  if (!Array.isArray(orders)) {
    return [];
  }

  return orders.map(order => {
    const filteredOrder = { ...order };
    
    // Both roles can see costs/payments
    // Only admins can see analytics data
    if (userRole === ROLES.ASSISTANT) {
      delete filteredOrder.analytics;
      delete filteredOrder.profitMargin;
      delete filteredOrder.costAnalysis;
    }
    
    return filteredOrder;
  });
}

function sanitizeAnalyticsData(data, userRole) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  // Block all analytics for assistants
  if (userRole === ROLES.ASSISTANT) {
    return {};
  }

  return { ...data };
}

module.exports = {
  ROLES,
  filterCustomerData,
  filterCustomerList,
  canAccessFinancialData,
  filterOrderHistory,
  sanitizeAnalyticsData
};

