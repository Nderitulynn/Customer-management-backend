const roleBasedFilter = require('../utils/roleBasedFilter');
const customerValidation = require('../validation/customerValidation');
const Customer = require('../models/Customer');
const auditLogger = require('../utils/auditLogger');

/**
 * Customer Service Module
 * Handles all customer-related business logic with role-based access control
 */

/**
 * Fetch all customers with role-based filtering and pagination
 * @param {string} userRole - Role of the requesting user
 * @param {string} userId - ID of the requesting user
 * @returns {Object} Paginated customer results
 */
const getAllCustomers = async (userRole, userId) => {
  try {
    // Apply role-based query filters
    const baseQuery = roleBasedFilter.getCustomerQuery(userRole, userId);
    
    // Execute query
    const customers = await Customer.find(baseQuery)
      .select(roleBasedFilter.getCustomerFields(userRole))
      .sort({ createdAt: -1 })
      .lean();

    // Apply field-level filtering based on user role
    const filteredCustomers = customers.map(customer => 
      roleBasedFilter.filterCustomerFields(customer, userRole)
    );

    auditLogger.log('CUSTOMER_LIST_ACCESS', {
      userId,
      userRole,
      resultCount: filteredCustomers.length
    });

    return {
      data: filteredCustomers,
      count: filteredCustomers.length
    };

  } catch (error) {
    auditLogger.logError('GET_ALL_CUSTOMERS_ERROR', {
      userId,
      userRole,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to fetch customers: ${error.message}`);
  }
};

/**
 * Get a single customer by ID with role-based field filtering
 * @param {string} customerId - Customer ID to fetch
 * @param {string} userRole - Role of the requesting user
 * @returns {Object} Customer data filtered by role
 */
const getCustomerById = async (customerId, userRole) => {
  try {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    // Get customer with role-based field selection
    const customer = await Customer.findById(customerId)
      .select(roleBasedFilter.getCustomerFields(userRole))
      .lean();

    if (!customer) {
      auditLogger.log('CUSTOMER_ACCESS_DENIED', {
        userRole,
        targetCustomerId: customerId,
        reason: 'Customer not found'
      });
      throw new Error('Customer not found');
    }

    // Apply field-level filtering
    const filteredCustomer = roleBasedFilter.filterCustomerFields(customer, userRole);

    auditLogger.log('CUSTOMER_VIEW', {
      userRole,
      customerId,
      viewedFields: Object.keys(filteredCustomer)
    });

    return filteredCustomer;

  } catch (error) {
    auditLogger.logError('GET_CUSTOMER_BY_ID_ERROR', {
      userRole,
      customerId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Create a new customer with validation and audit logging
 * @param {Object} customerData - Customer data to create
 * @param {string} userId - ID of the user creating the customer
 * @returns {Object} Created customer data
 */
const createCustomer = async (customerData, userId) => {
  try {
    // Validate input data
    const validationResult = customerValidation.validateCreateData(customerData);
    if (!validationResult.isValid) {
      throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Check for duplicate email or phone
    const existingCustomer = await Customer.findOne({
      $or: [
        { email: customerData.email },
        { phone: customerData.phone }
      ]
    });

    if (existingCustomer) {
      throw new Error('Customer with this email or phone already exists');
    }

    // Create customer with audit fields
    const customerToCreate = {
      ...validationResult.sanitizedData,
      createdBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };

    const newCustomer = new Customer(customerToCreate);
    const savedCustomer = await newCustomer.save();

    auditLogger.log('CUSTOMER_CREATED', {
      userId,
      customerId: savedCustomer._id,
      customerData: {
        name: savedCustomer.name,
        email: savedCustomer.email,
        phone: savedCustomer.phone
      }
    });

    return savedCustomer.toObject();

  } catch (error) {
    auditLogger.logError('CREATE_CUSTOMER_ERROR', {
      userId,
      customerData: { ...customerData, password: '[REDACTED]' },
      error: error.message
    });
    throw error;
  }
};

/**
 * Update customer with role-based permissions and validation
 * @param {string} customerId - ID of customer to update
 * @param {Object} updateData - Data to update
 * @param {string} userId - ID of user making the update
 * @param {string} userRole - Role of the updating user
 * @returns {Object} Updated customer data
 */
const updateCustomer = async (customerId, updateData, userId, userRole) => {
  try {
    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    // Check update permissions
    if (!roleBasedFilter.canUpdateCustomer(userRole, userId, customerId)) {
      throw new Error('Insufficient permissions to update this customer');
    }

    // Get current customer data
    const existingCustomer = await Customer.findById(customerId);
    if (!existingCustomer) {
      throw new Error('Customer not found');
    }

    // Filter update data based on role permissions
    const allowedUpdateData = roleBasedFilter.filterUpdateFields(updateData, userRole);
    
    // Validate update data
    const validationResult = customerValidation.validateUpdateData(allowedUpdateData);
    if (!validationResult.isValid) {
      throw new Error(`Validation failed: ${validationResult.errors.join(', ')}`);
    }

    // Check for conflicts if email/phone is being updated
    if (validationResult.sanitizedData.email || validationResult.sanitizedData.phone) {
      const conflictQuery = {
        _id: { $ne: customerId },
        $or: []
      };

      if (validationResult.sanitizedData.email) {
        conflictQuery.$or.push({ email: validationResult.sanitizedData.email });
      }
      if (validationResult.sanitizedData.phone) {
        conflictQuery.$or.push({ phone: validationResult.sanitizedData.phone });
      }

      const conflictingCustomer = await Customer.findOne(conflictQuery);
      if (conflictingCustomer) {
        throw new Error('Another customer with this email or phone already exists');
      }
    }

    // Prepare update object
    const updateObject = {
      ...validationResult.sanitizedData,
      updatedBy: userId,
      updatedAt: new Date()
    };

    // Perform update
    const updatedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      updateObject,
      { new: true, runValidators: true }
    ).lean();

    // Log the update
    auditLogger.log('CUSTOMER_UPDATED', {
      userId,
      userRole,
      customerId,
      updatedFields: Object.keys(validationResult.sanitizedData),
      previousValues: roleBasedFilter.getAuditableFields(existingCustomer, userRole),
      newValues: roleBasedFilter.getAuditableFields(updatedCustomer, userRole)
    });

    return roleBasedFilter.filterCustomerFields(updatedCustomer, userRole);

  } catch (error) {
    auditLogger.logError('UPDATE_CUSTOMER_ERROR', {
      userId,
      userRole,
      customerId,
      updateData: { ...updateData, password: '[REDACTED]' },
      error: error.message
    });
    throw error;
  }
};

/**
 * Delete customer (Admin only) with audit logging
 * @param {string} customerId - ID of customer to delete
 * @param {string} userRole - Role of the requesting user
 * @returns {Object} Success confirmation
 */
const deleteCustomer = async (customerId, userRole) => {
  try {
    // Only admins can delete customers
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      throw new Error('Only administrators can delete customers');
    }

    if (!customerId) {
      throw new Error('Customer ID is required');
    }

    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    if (customer.isDeleted) {
      throw new Error('Customer is already deleted');
    }

    // Perform soft delete
    const deletedCustomer = await Customer.findByIdAndUpdate(
      customerId,
      {
        isDeleted: true,
        deletedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    );

    auditLogger.log('CUSTOMER_DELETED', {
      userRole,
      customerId,
      customerName: customer.name,
      customerEmail: customer.email,
      deletionType: 'soft_delete'
    });

    return {
      success: true,
      message: 'Customer successfully deleted',
      customerId: deletedCustomer._id
    };

  } catch (error) {
    auditLogger.logError('DELETE_CUSTOMER_ERROR', {
      userRole,
      customerId,
      error: error.message
    });
    throw error;
  }
};

/**
 * Search customers with role-based filtering
 * @param {string} searchQuery - Search term
 * @param {string} userRole - Role of the requesting user
 * @returns {Object} Search results
 */
const searchCustomers = async (searchQuery, userRole) => {
  try {
    if (!searchQuery || searchQuery.trim().length < 2) {
      throw new Error('Search query must be at least 2 characters long');
    }

    // Build search criteria based on role permissions
    const baseQuery = roleBasedFilter.getCustomerQuery(userRole);
    const searchCriteria = {
      ...baseQuery,
      $and: [
        baseQuery,
        {
          $or: [
            { name: { $regex: searchQuery, $options: 'i' } },
            { email: { $regex: searchQuery, $options: 'i' } },
            { phone: { $regex: searchQuery, $options: 'i' } },
            { company: { $regex: searchQuery, $options: 'i' } }
          ]
        }
      ]
    };

    // Execute search
    const customers = await Customer.find(searchCriteria)
      .select(roleBasedFilter.getCustomerFields(userRole))
      .sort({ updatedAt: -1 })
      .lean();

    // Apply field-level filtering
    const filteredResults = customers.map(customer => 
      roleBasedFilter.filterCustomerFields(customer, userRole)
    );

    auditLogger.log('CUSTOMER_SEARCH', {
      userRole,
      searchQuery,
      resultCount: filteredResults.length
    });

    return {
      data: filteredResults,
      searchQuery,
      count: filteredResults.length
    };

  } catch (error) {
    auditLogger.logError('SEARCH_CUSTOMERS_ERROR', {
      userRole,
      searchQuery,
      error: error.message
    });
    throw error;
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  searchCustomers
};