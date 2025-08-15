const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const User = require('../models/User');

/**
 * Customer Receipt Validation Middleware
 * Handles customer receipt business rules and validation
 * (Replaced assignment system with automatic receipt by logged-in assistant)
 */

/**
 * Validate that customer can be received by current assistant
 */
const validateCustomerReceipt = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    
    if (!customerId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID is required'
      });
    }

    const customer = await Customer.findById(customerId);
    
    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    // Check if customer is already received by another assistant
    if (customer.receivedBy && customer.receivedBy.toString() !== req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Customer is already being handled by another assistant',
        receivedBy: customer.receivedBy,
        receivedAt: customer.receivedAt
      });
    }

    // Attach customer to request for next middleware
    req.customer = customer;
    next();
  } catch (error) {
    console.error('Error validating customer receipt status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during receipt validation'
    });
  }
};

/**
 * Check assistant permissions for receiving customers
 */
const validateAssistantReceiptPermissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if user is an assistant
    if (user.role !== 'assistant') {
      return res.status(403).json({
        success: false,
        message: 'Only assistants can receive customers'
      });
    }

    // Check if assistant is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Assistant account is not active'
      });
    }

    // Check if assistant has reached maximum customer limit (if applicable)
    const receivedCustomersCount = await Customer.countDocuments({
      receivedBy: userId
    });

    const maxCustomersLimit = user.maxCustomersLimit || 50; // Default limit
    
    if (receivedCustomersCount >= maxCustomersLimit) {
      return res.status(403).json({
        success: false,
        message: `Cannot receive customer. Maximum limit of ${maxCustomersLimit} customers reached`,
        currentReceipts: receivedCustomersCount
      });
    }

    // Check if assistant has receipt permissions
    if (user.permissions && !user.permissions.includes('receive_customers')) {
      return res.status(403).json({
        success: false,
        message: 'Assistant does not have permission to receive customers'
      });
    }

    next();
  } catch (error) {
    console.error('Error validating assistant receipt permissions:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during permission validation'
    });
  }
};

/**
 * Validate customer transfer (when transferring between assistants)
 */
const validateCustomerTransfer = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { transferTo } = req.body;
    const userId = req.user.id;

    if (!transferTo) {
      return res.status(400).json({
        success: false,
        message: 'Transfer recipient (transferTo) is required'
      });
    }

    // Check if transfer recipient exists and is an assistant
    const recipient = await User.findById(transferTo);
    if (!recipient || recipient.role !== 'assistant') {
      return res.status(400).json({
        success: false,
        message: 'Transfer recipient must be a valid assistant'
      });
    }

    // Check if recipient is active
    if (recipient.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Transfer recipient is not active'
      });
    }

    // Check if current user has permission to transfer
    const currentUser = await User.findById(userId);
    if (!['supervisor', 'manager', 'admin'].includes(currentUser.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only supervisors, managers, and admins can transfer customers'
      });
    }

    // Check recipient's customer limit
    const recipientCustomerCount = await Customer.countDocuments({
      receivedBy: transferTo
    });

    const maxLimit = recipient.maxCustomersLimit || 50;
    if (recipientCustomerCount >= maxLimit) {
      return res.status(400).json({
        success: false,
        message: `Cannot transfer. Recipient has reached maximum limit of ${maxLimit} customers`,
        recipientCurrentReceipts: recipientCustomerCount
      });
    }

    req.transferRecipient = recipient;
    next();
  } catch (error) {
    console.error('Error validating customer transfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during transfer validation'
    });
  }
};

/**
 * Express validator rules for customer receipt requests
 */
const receiptValidationRules = () => {
  return [
    body('action')
      .isIn(['receive', 'transfer'])
      .withMessage('Action must be receive or transfer'),
    body('transferTo')
      .optional()
      .isMongoId()
      .withMessage('Transfer recipient must be a valid user ID'),
    body('reason')
      .optional()
      .isLength({ min: 1, max: 500 })
      .withMessage('Reason must be between 1 and 500 characters')
  ];
};

/**
 * Handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

module.exports = {
  validateCustomerReceipt,
  validateAssistantReceiptPermissions,
  validateCustomerTransfer,
  receiptValidationRules,
  handleValidationErrors
};