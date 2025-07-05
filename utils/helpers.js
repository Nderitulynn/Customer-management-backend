// Data formatting utilities for dashboard displays
function formatCurrency(amount) {
  return parseFloat(amount || 0).toLocaleString();
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

// Password generation utility
function generatePassword(length = 8) {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  // Ensure password has at least one character from each category
  const allChars = lowercase + uppercase + numbers + symbols;
  let password = '';
  
  // Add one character from each category first
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];
  
  // Fill the rest with random characters
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to avoid predictable patterns
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Email sending utility (placeholder - implement with your email service)
function sendEmail(email, subject, message) {
  // This is a placeholder function - implement with your preferred email service
  // Example: nodemailer, sendgrid, etc.
  console.log(`Sending email to: ${email}`);
  console.log(`Subject: ${subject}`);
  console.log(`Message: ${message}`);
  
  // Return a promise for async handling
  return Promise.resolve({
    success: true,
    message: 'Email sent successfully'
  });
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
  paginatedResponse,
  generatePassword,
  sendEmail
};