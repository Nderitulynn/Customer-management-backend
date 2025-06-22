const VALIDATION_RULES = {
  ADMIN: {
    required: ['name', 'email', 'phone'],
    optional: ['address', 'notes', 'status', 'totalSpent']
  },
  ASSISTANT: {
    required: ['name', 'email', 'phone'],
    optional: ['address', 'notes', 'status']
  }
};

function validateCustomerCreation(data) {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Invalid data format'] };
  }

  // Check required fields
  const required = ['name', 'email', 'phone'];
  required.forEach(field => {
    if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
      errors.push(`${field} is required`);
    }
  });

  // Validate email format
  if (data.email && !validateEmail(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate phone format
  if (data.phone && !validateKenyanPhone(data.phone)) {
    errors.push('Invalid Kenyan phone number format');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

function validateCustomerUpdate(data, userRole) {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    return { isValid: false, errors: ['Invalid data format'] };
  }

  const allowedFields = VALIDATION_RULES[userRole];
  if (!allowedFields) {
    return { isValid: false, errors: ['Invalid user role'] };
  }

  // Check if user is trying to update restricted fields
  const restrictedFields = userRole === 'ASSISTANT' ? ['totalSpent', 'analytics'] : [];
  restrictedFields.forEach(field => {
    if (data.hasOwnProperty(field)) {
      errors.push(`Not authorized to update ${field}`);
    }
  });

  // Validate email if provided
  if (data.email && !validateEmail(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate phone if provided
  if (data.phone && !validateKenyanPhone(data.phone)) {
    errors.push('Invalid Kenyan phone number format');
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

function sanitizeCustomerInput(data) {
  if (!data || typeof data !== 'object') {
    return {};
  }

  const sanitized = {};
  
  Object.keys(data).forEach(key => {
    if (typeof data[key] === 'string') {
      // Basic XSS protection - remove HTML tags and escape special characters
      sanitized[key] = data[key]
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .replace(/[<>&"']/g, match => {
          const escapeMap = {
            '<': '&lt;',
            '>': '&gt;',
            '&': '&amp;',
            '"': '&quot;',
            "'": '&#x27;'
          };
          return escapeMap[match];
        })
        .trim();
    } else {
      sanitized[key] = data[key];
    }
  });

  return sanitized;
}

function validateKenyanPhone(phone) {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Kenyan phone number patterns
  const patterns = [
    /^(\+254|254|0)(7|1)\d{8}$/, // Mobile numbers
    /^(\+254|254|0)(2|4|5)\d{7}$/ // Landline numbers
  ];

  return patterns.some(pattern => pattern.test(phone.replace(/\s/g, '')));
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function validateRequiredFields(data, operation) {
  const errors = [];
  
  if (operation === 'create') {
    const required = ['name', 'email', 'phone'];
    required.forEach(field => {
      if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
        errors.push(`${field} is required for customer creation`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors: errors
  };
}

function formatValidationError(errors) {
  if (!Array.isArray(errors) || errors.length === 0) {
    return 'Validation failed';
  }

  return errors.join(', ');
}

module.exports = {
  validateCustomerCreation,
  validateCustomerUpdate,
  sanitizeCustomerInput,
  validateKenyanPhone,
  validateEmail,
  validateRequiredFields,
  formatValidationError,
  VALIDATION_RULES
};