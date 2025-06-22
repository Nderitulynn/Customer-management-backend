// File 5: utils/searchHelpers.js
const { sanitizeCustomerInput, validateKenyanPhone } = require('./customerValidation');

function buildSearchQuery(searchTerm) {
  if (!searchTerm || typeof searchTerm !== 'string') {
    return {};
  }

  // Sanitize input to prevent injection
  const sanitizedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  
  // Build MongoDB text search query
  const query = {
    $or: [
      { name: { $regex: sanitizedTerm, $options: 'i' } },
      { email: { $regex: sanitizedTerm, $options: 'i' } },
      { phone: { $regex: sanitizedTerm, $options: 'i' } }
    ]
  };

  return query;
}

function buildFilterQuery(filters, userRole) {
  if (!filters || typeof filters !== 'object') {
    return {};
  }

  const query = {};
  
  // Status filter
  if (filters.status) {
    query.status = filters.status;
  }

  // Date range filter
  if (filters.dateFrom || filters.dateTo) {
    query.dateCreated = {};
    if (filters.dateFrom) {
      query.dateCreated.$gte = new Date(filters.dateFrom);
    }
    if (filters.dateTo) {
      query.dateCreated.$lte = new Date(filters.dateTo);
    }
  }

  // Phone validation for phone-based searches
  if (filters.phone && validateKenyanPhone(filters.phone)) {
    query.phone = { $regex: filters.phone, $options: 'i' };
  }

  // Role-based filtering
  if (userRole === 'ASSISTANT') {
    // Assistants can't filter by admin-only fields
    delete query.totalSpent;
    delete query.analytics;
  }

  return query;
}

function sortCustomers(customers, sortBy = 'name', sortOrder = 'asc') {
  if (!Array.isArray(customers)) {
    return [];
  }

  const validSortFields = ['name', 'dateCreated', 'phone', 'email'];
  const field = validSortFields.includes(sortBy) ? sortBy : 'name';
  const order = sortOrder === 'desc' ? -1 : 1;

  return customers.sort((a, b) => {
    let aVal = a[field];
    let bVal = b[field];

    // Handle date sorting
    if (field === 'dateCreated') {
      aVal = new Date(aVal);
      bVal = new Date(bVal);
    }

    // Handle string sorting
    if (typeof aVal === 'string') {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    if (aVal < bVal) return -1 * order;
    if (aVal > bVal) return 1 * order;
    return 0;
  });
}

function paginateResults(query, page = 1, limit = 10) {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
  const skip = (pageNum - 1) * limitNum;

  return {
    query: query,
    skip: skip,
    limit: limitNum,
    metadata: {
      page: pageNum,
      limit: limitNum,
      skip: skip
    }
  };
}

function buildSearchFilters(searchParams, userRole) {
  const sanitizedParams = sanitizeCustomerInput(searchParams);
  const filters = {};

  // Build text search
  if (sanitizedParams.search) {
    Object.assign(filters, buildSearchQuery(sanitizedParams.search));
  }

  // Build additional filters
  const additionalFilters = buildFilterQuery(sanitizedParams, userRole);
  Object.assign(filters, additionalFilters);

  return filters;
}

function formatSearchError(error) {
  if (typeof error === 'string') {
    return error;
  }
  return 'Search operation failed';
}

module.exports = {
  buildSearchQuery,
  buildFilterQuery,
  sortCustomers,
  paginateResults,
  buildSearchFilters,
  formatSearchError
};

