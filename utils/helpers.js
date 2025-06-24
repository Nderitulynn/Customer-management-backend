// Data formatting utilities for dashboard displays
function formatCurrency(amount) {
  return `KSh ${parseFloat(amount || 0).toLocaleString()}`;
}

function formatOrderCount(count) {
  return parseInt(count || 0).toLocaleString();
}

function formatPercentage(value) {
  return `${parseFloat(value || 0).toFixed(1)}%`;
}

// Date/time helpers for order scheduling and business hours
function isWithinBusinessHours(date = new Date()) {
  const hour = date.getHours();
  return hour >= 8 && hour < 18; // 8 AM to 6 PM
}

function formatOrderDate(date) {
  return new Date(date).toLocaleDateString('en-KE');
}

function getNextBusinessDay(date = new Date()) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  if (next.getDay() === 0) next.setDate(next.getDate() + 1); // Skip Sunday
  return next;
}

// Assignment helper functions for customer-to-assistant mapping
function assignCustomerToAssistant(customers, assistants) {
  if (!assistants.length) return null;
  
  const leastBusy = assistants.reduce((min, assistant) => 
    assistant.activeCustomers < min.activeCustomers ? assistant : min
  );
  
  return leastBusy.id;
}

function canReassignCustomer(customer, assistant) {
  return assistant.activeCustomers < 10 && customer.status !== 'PROCESSING';
}

// Status transition helpers for order workflow
function getNextOrderStatus(currentStatus) {
  const statusFlow = {
    'PENDING': 'CONFIRMED',
    'CONFIRMED': 'PROCESSING',
    'PROCESSING': 'COMPLETED',
    'COMPLETED': 'COMPLETED'
  };
  return statusFlow[currentStatus] || 'PENDING';
}

function canTransitionStatus(from, to) {
  const validTransitions = {
    'PENDING': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['PROCESSING', 'CANCELLED'],
    'PROCESSING': ['COMPLETED', 'CANCELLED'],
    'COMPLETED': [],
    'CANCELLED': []
  };
  return validTransitions[from]?.includes(to) || false;
}

// Pagination utilities for customer/order lists
function getPaginationMeta(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  return {
    total,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
}

// Response formatting helpers for consistent API responses
function successResponse(data, message = 'Success') {
  return {
    success: true,
    message,
    data
  };
}

function errorResponse(message, code = 400) {
  return {
    success: false,
    message,
    error: { code }
  };
}

function paginatedResponse(data, meta, message = 'Data retrieved') {
  return {
    success: true,
    message,
    data,
    pagination: meta
  };
}

module.exports = {
  formatCurrency,
  formatOrderCount,
  formatPercentage,
  isWithinBusinessHours,
  formatOrderDate,
  getNextBusinessDay,
  assignCustomerToAssistant,
  canReassignCustomer,
  getNextOrderStatus,
  canTransitionStatus,
  getPaginationMeta,
  successResponse,
  errorResponse,
  paginatedResponse
};