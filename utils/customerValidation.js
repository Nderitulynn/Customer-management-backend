const VALIDATION_RULES = {
  ADMIN: {
    required: ['fullName', 'email', 'phone'],
    optional: ['address', 'notes', 'status', 'totalSpent']
  },
  ASSISTANT: {
    required: ['fullName', 'email', 'phone'],
    optional: ['address', 'notes', 'status']
  }
};

function validateCustomer(data, isUpdate = false) {
  const errors = [];
  
  if (!data || typeof data !== 'object') {
    return ['Invalid data format'];
  }

  // For creation, check required fields
  if (!isUpdate) {
    const required = ['fullName', 'email', 'phone'];
    required.forEach(field => {
      if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
        errors.push(`${field} is required`);
      }
    });
  } else {
    // For updates, only validate fields that are present
    if (data.fullName !== undefined) {
      if (!data.fullName || typeof data.fullName !== 'string' || data.fullName.trim() === '') {
        errors.push('fullName cannot be empty');
      }
    }
  }

  // Validate email format if provided
  if (data.email && !validateEmail(data.email)) {
    errors.push('Invalid email format');
  }

  // Validate phone format if provided
  if (data.phone && !validateKenyanPhone(data.phone)) {
    errors.push('Invalid Kenyan phone number format');
  }

  // Validate fullName length and format if provided
  if (data.fullName) {
    if (data.fullName.length < 2) {
      errors.push('Full name must be at least 2 characters long');
    }
    if (data.fullName.length > 100) {
      errors.push('Full name must not exceed 100 characters');
    }
    // Check for valid name format (letters, spaces, hyphens, apostrophes)
    if (!/^[a-zA-Z\s\-']+$/.test(data.fullName)) {
      errors.push('Full name can only contain letters, spaces, hyphens, and apostrophes');
    }
  }

  return errors;
}

function validateCustomerCreation(data) {
  const errors = validateCustomer(data, false);
  
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

  // Use the main validateCustomer function for field validation
  const fieldErrors = validateCustomer(data, true);
  errors.push(...fieldErrors);

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
      
      // Special handling for fullName - proper case formatting
      if (key === 'fullName' && sanitized[key]) {
        sanitized[key] = sanitized[key]
          .split(' ')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      }
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
  return emailRegex.test(email) && email.length <= 254; // RFC 5321 limit
}

function validateRequiredFields(data, operation) {
  const errors = [];
  
  if (operation === 'create') {
    const required = ['fullName', 'email', 'phone'];
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

// Additional utility function to validate customer status
function validateCustomerStatus(status) {
  const validStatuses = ['active', 'inactive', 'pending', 'suspended'];
  return validStatuses.includes(status);
}

// Utility function to normalize fullName
function normalizeFullName(fullName) {
  if (!fullName || typeof fullName !== 'string') {
    return '';
  }
  
  return fullName
    .trim()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

module.exports = {
  validateCustomer,
  validateCustomerCreation,
  validateCustomerUpdate,
  sanitizeCustomerInput,
  validateKenyanPhone,
  validateEmail,
  validateRequiredFields,
  formatValidationError,
  validateCustomerStatus,
  normalizeFullName,
  VALIDATION_RULES
};