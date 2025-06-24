class ValidationMiddleware {
  constructor() {
    this.rateLimits = new Map();
    this.existingEmails = new Set();
    this.customerAssignments = new Map();
    this.assistantList = new Set();
  }

  sanitize(input) {
    if (typeof input !== 'string') return input;
    return input.replace(/[<>\"'&]/g, (match) => {
      const chars = { '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '&': '&amp;' };
      return chars[match];
    });
  }

  checkRateLimit(identifier, maxAttempts = 10, windowMs = 15 * 60 * 1000) {
    const now = Date.now();
    const key = `${identifier}_${Math.floor(now / windowMs)}`;
    const attempts = this.rateLimits.get(key) || 0;
    
    if (attempts >= maxAttempts) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    
    this.rateLimits.set(key, attempts + 1);
  }

  validateLogin(data) {
    this.checkRateLimit(data.email || 'unknown', 5, 15 * 60 * 1000);
    
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error('Valid email is required');
    }
    if (!data.password || data.password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }
    
    return {
      email: this.sanitize(data.email.toLowerCase().trim()),
      password: data.password
    };
  }

  validateUserRegistration(data, currentUserRole) {
    if (currentUserRole !== 'admin') {
      throw new Error('Only administrators can create assistant accounts');
    }
    
    this.checkRateLimit(`registration_${data.email}`, 3, 10 * 60 * 1000);
    
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      throw new Error('Valid email is required');
    }
    if (this.existingEmails.has(data.email.toLowerCase())) {
      throw new Error('Email already exists');
    }
    if (!data.password || data.password.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(data.password)) {
      throw new Error('Password must be 8+ chars with uppercase, lowercase, and number');
    }
    if (!data.firstName || !data.lastName || data.firstName.length < 2 || data.lastName.length < 2) {
      throw new Error('First and last names are required (2+ characters)');
    }
    
    const validated = {
      email: this.sanitize(data.email.toLowerCase().trim()),
      password: data.password,
      firstName: this.sanitize(data.firstName.trim()),
      lastName: this.sanitize(data.lastName.trim()),
      role: 'assistant'
    };
    
    this.existingEmails.add(validated.email);
    this.assistantList.add(validated.email);
    
    return validated;
  }

  validateRoleAssignment(data, currentUserRole) {
    if (currentUserRole !== 'admin') {
      throw new Error('Only administrators can assign customers to assistants');
    }
    
    if (!data.assistantId || !this.assistantList.has(data.assistantId)) {
      throw new Error('Valid assistant ID is required');
    }
    if (!data.customerIds || !Array.isArray(data.customerIds) || data.customerIds.length === 0) {
      throw new Error('At least one customer ID is required');
    }
    
    const validated = {
      assistantId: this.sanitize(data.assistantId),
      customerIds: data.customerIds.map(id => this.sanitize(id.toString()))
    };
    
    if (!this.customerAssignments.has(validated.assistantId)) {
      this.customerAssignments.set(validated.assistantId, []);
    }
    this.customerAssignments.get(validated.assistantId).push(...validated.customerIds);
    
    return validated;
  }

  validateCustomer(data, currentUserRole, assistantId = null, isUpdate = false) {
    const validated = {};
    
    if (!isUpdate) {
      if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        throw new Error('Valid email is required');
      }
      validated.email = this.sanitize(data.email.toLowerCase().trim());
    }
    
    if (!isUpdate && (!data.firstName || !data.lastName || data.firstName.length < 2 || data.lastName.length < 2)) {
      throw new Error('First and last names are required (2+ characters)');
    }
    
    if (data.firstName) validated.firstName = this.sanitize(data.firstName.trim());
    if (data.lastName) validated.lastName = this.sanitize(data.lastName.trim());
    if (data.phone) validated.phone = this.sanitize(data.phone.replace(/\s/g, ''));
    if (data.company) validated.company = this.sanitize(data.company.trim());
    
    if (currentUserRole === 'admin') {
      if (data.creditLimit !== undefined) {
        const limit = parseFloat(data.creditLimit);
        if (isNaN(limit) || limit < 0 || limit > 100000) {
          throw new Error('Credit limit must be between 0 and 100,000');
        }
        validated.creditLimit = limit;
      }
      if (data.paymentTerms && ['net-30', 'net-60', 'net-90', 'immediate'].includes(data.paymentTerms)) {
        validated.paymentTerms = data.paymentTerms;
      }
    } else if (data.creditLimit !== undefined || data.paymentTerms !== undefined) {
      throw new Error('Assistants cannot modify financial data');
    }
    
    return validated;
  }

  validateOrder(data, currentUserRole, assistantId = null) {
    if (currentUserRole === 'assistant' && data.customerId) {
      const assignedCustomers = this.customerAssignments.get(assistantId) || [];
      if (!assignedCustomers.includes(data.customerId.toString())) {
        throw new Error('Access denied: Customer not assigned to this assistant');
      }
    }
    
    if (!data.customerId) {
      throw new Error('Customer ID is required');
    }
    if (!data.items || !Array.isArray(data.items) || data.items.length === 0) {
      throw new Error('Order must contain at least one item');
    }
    
    const validated = {
      customerId: this.sanitize(data.customerId.toString()),
      items: [],
      totalAmount: 0
    };
    
    const maxPrice = currentUserRole === 'admin' ? 50000 : 10000;
    
    data.items.forEach((item, index) => {
      if (!item.productId) throw new Error(`Item ${index + 1}: Product ID is required`);
      
      const quantity = parseInt(item.quantity);
      const price = parseFloat(item.price);
      
      if (!quantity || quantity < 1 || quantity > 1000) {
        throw new Error(`Item ${index + 1}: Quantity must be 1-1000`);
      }
      if (isNaN(price) || price < 0 || price > maxPrice) {
        throw new Error(`Item ${index + 1}: Invalid price or exceeds ${maxPrice} limit`);
      }
      
      const subtotal = quantity * price;
      validated.items.push({
        productId: this.sanitize(item.productId.toString()),
        quantity,
        price,
        subtotal
      });
      validated.totalAmount += subtotal;
    });
    
    const maxOrderValue = currentUserRole === 'admin' ? 100000 : 25000;
    if (validated.totalAmount > maxOrderValue) {
      throw new Error(`Order total exceeds ${maxOrderValue} limit for ${currentUserRole}s`);
    }
    
    if (data.notes) {
      const maxLength = currentUserRole === 'admin' ? 1000 : 500;
      if (data.notes.length > maxLength) {
        throw new Error(`Notes exceed ${maxLength} character limit`);
      }
      validated.notes = this.sanitize(data.notes.trim());
    }
    
    if (data.priority) {
      if (currentUserRole !== 'admin') {
        throw new Error('Only administrators can set order priority');
      }
      if (['low', 'normal', 'high', 'urgent'].includes(data.priority)) {
        validated.priority = data.priority;
      }
    }
    
    return validated;
  }

  validateDataOwnership(resourceType, resourceId, currentUserRole, assistantId) {
    if (currentUserRole === 'admin') return true;
    
    if (currentUserRole === 'assistant' && (resourceType === 'customer' || resourceType === 'order')) {
      const assignedCustomers = this.customerAssignments.get(assistantId) || [];
      return assignedCustomers.includes(resourceId.toString());
    }
    
    return false;
  }

  validateFileUpload(files, maxSize = 10 * 1024 * 1024, allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']) {
    if (!files || files.length === 0) throw new Error('No files provided');
    if (files.length > 5) throw new Error('Maximum 5 files allowed');
    
    return Array.from(files).map((file, index) => {
      if (file.size > maxSize) {
        throw new Error(`File ${index + 1}: Size exceeds ${maxSize / 1024 / 1024}MB limit`);
      }
      if (!allowedTypes.includes(file.type)) {
        throw new Error(`File ${index + 1}: Type not allowed`);
      }
      return file;
    });
  }

  validateRequest(validationType) {
    return (req, res, next) => {
      try {
        const userRole = req.user?.role || 'assistant';
        const assistantId = req.user?.id;
        let validatedData;
        
        switch (validationType) {
          case 'login':
            validatedData = this.validateLogin(req.body);
            break;
          case 'userRegistration':
            validatedData = this.validateUserRegistration(req.body, userRole);
            break;
          case 'roleAssignment':
            validatedData = this.validateRoleAssignment(req.body, userRole);
            break;
          case 'customer':
            validatedData = this.validateCustomer(req.body, userRole, assistantId, req.method === 'PUT');
            break;
          case 'order':
            validatedData = this.validateOrder(req.body, userRole, assistantId);
            break;
          case 'fileUpload':
            validatedData = this.validateFileUpload(req.files);
            break;
          default:
            throw new Error('Unknown validation type');
        }
        
        req.validatedData = validatedData;
        next();
        
      } catch (error) {
        res.status(400).json({
          error: userRole === 'admin' ? error.message : 'Invalid data provided',
          code: 'VALIDATION_ERROR'
        });
      }
    };
  }
}

module.exports = ValidationMiddleware;