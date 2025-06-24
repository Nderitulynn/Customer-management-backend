// Basic Validators
export const isValidEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

export const isValidPhone = (phone) => {
  const regex = /^(\+\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,4}[-.\s]?\d{1,9}$/;
  return regex.test(phone.replace(/\s/g, ''));
};

export const isStrongPassword = (password) => {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[!@#$%^&*(),.?":{}|<>]/.test(password);
};

export const isValidDate = (date) => {
  const d = new Date(date);
  return d instanceof Date && !isNaN(d) && d > new Date('1900-01-01');
};

export const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// Business Logic Validators
export const isValidOrderData = (orderData) => {
  const required = ['customerId', 'items', 'totalAmount'];
  return validateRequired(required, orderData) &&
    Array.isArray(orderData.items) &&
    orderData.items.length > 0 &&
    orderData.totalAmount > 0;
};

export const isValidCustomerData = (customerData) => {
  const required = ['name', 'email', 'phone'];
  return validateRequired(required, customerData) &&
    isValidEmail(customerData.email) &&
    isValidPhone(customerData.phone);
};

export const hasRequiredPermissions = (user, action) => {
  if (!user?.permissions) return false;
  const permissionMap = {
    'create_order': ['admin', 'sales'],
    'edit_customer': ['admin', 'manager'],
    'view_reports': ['admin', 'manager', 'sales'],
    'manage_users': ['admin']
  };
  return permissionMap[action]?.some(role => user.permissions.includes(role));
};

export const isWithinBusinessHours = (datetime) => {
  const date = new Date(datetime);
  const hour = date.getHours();
  const day = date.getDay();
  return day >= 1 && day <= 5 && hour >= 9 && hour < 17; // Mon-Fri, 9AM-5PM
};

export const isValidDeliveryDate = (date) => {
  const deliveryDate = new Date(date);
  const now = new Date();
  const minDate = new Date(now.getTime() + 24 * 60 * 60 * 1000); // +1 day
  const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // +30 days
  return deliveryDate >= minDate && deliveryDate <= maxDate;
};

// Data Integrity Validators
export const validatePricing = (price, discounts = 0, taxes = 0) => {
  const numPrice = parseFloat(price);
  const numDiscounts = parseFloat(discounts);
  const numTaxes = parseFloat(taxes);
  
  return numPrice > 0 &&
    numDiscounts >= 0 &&
    numDiscounts <= numPrice &&
    numTaxes >= 0;
};

export const validateInventory = (items) => {
  return Array.isArray(items) &&
    items.every(item => 
      item.productId &&
      typeof item.quantity === 'number' &&
      item.quantity > 0 &&
      (item.availableStock === undefined || item.quantity <= item.availableStock)
    );
};

export const validateUserAssignments = (user, customers) => {
  if (!user?.id || !Array.isArray(customers)) return false;
  return customers.every(customer => 
    customer.assignedUserId === user.id ||
    user.permissions?.includes('admin')
  );
};

export const validateFileUpload = (file) => {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif',
    'application/pdf', 'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];
  
  return file &&
    file.size <= maxSize &&
    allowedTypes.includes(file.type);
};

// Utility Functions
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>\"']/g, '')
    .trim()
    .substring(0, 1000); // Limit length
};

export const formatErrorMessages = (errors) => {
  if (Array.isArray(errors)) {
    return errors.map(err => ({
      field: err.field || 'unknown',
      message: err.message || 'Invalid input',
      code: err.code || 'VALIDATION_ERROR'
    }));
  }
  return [{ field: 'general', message: errors.toString(), code: 'VALIDATION_ERROR' }];
};

export const validateRequired = (fields, data) => {
  return fields.every(field => 
    data?.[field] !== undefined && 
    data[field] !== null && 
    data[field] !== ''
  );
};

export const validateConditional = (conditions, data) => {
  return conditions.every(condition => {
    const { field, dependsOn, dependsOnValue, required } = condition;
    
    if (data[dependsOn] === dependsOnValue) {
      return required ? validateRequired([field], data) : true;
    }
    return true;
  });
};