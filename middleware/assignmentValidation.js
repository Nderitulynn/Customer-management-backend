const { body, validationResult } = require('express-validator');
const Customer = require('../models/Customer');
const AssignmentAudit = require('../models/AssignmentAudit');
const User = require('../models/User');

/**
 * Assignment Validation Middleware
 * Handles customer assignment business rules and validation
 */

/**
 * Validate that customer is unassigned before claiming
 */
const validateCustomerUnassigned = async (req, res, next) => {
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

    // Check if customer is already assigned
    if (customer.assignedTo && customer.assignmentStatus === 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Customer is already assigned to another assistant',
        assignedTo: customer.assignedTo,
        assignedAt: customer.assignedAt
      });
    }

    // Attach customer to request for next middleware
    req.customer = customer;
    next();
  } catch (error) {
    console.error('Error validating customer assignment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during assignment validation'
    });
  }
};

/**
 * Check assistant permissions for claiming customers
 */
const validateAssistantClaimPermissions = async (req, res, next) => {
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
        message: 'Only assistants can claim customers'
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
    const assignedCustomersCount = await Customer.countDocuments({
      assignedTo: userId,
      assignmentStatus: 'assigned'
    });

    const maxCustomersLimit = user.maxCustomersLimit || 50; // Default limit
    
    if (assignedCustomersCount >= maxCustomersLimit) {
      return res.status(403).json({
        success: false,
        message: `Cannot claim customer. Maximum limit of ${maxCustomersLimit} customers reached`,
        currentAssignments: assignedCustomersCount
      });
    }

    // Check if assistant has claim permissions
    if (user.permissions && !user.permissions.includes('claim_customers')) {
      return res.status(403).json({
        success: false,
        message: 'Assistant does not have permission to claim customers'
      });
    }

    next();
  } catch (error) {
    console.error('Error validating assistant claim permissions:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during permission validation'
    });
  }
};

/**
 * Prevent assistants from unclaiming customers
 */
const preventAssistantUnclaim = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // If user is an assistant, prevent unclaiming
    if (user.role === 'assistant') {
      return res.status(403).json({
        success: false,
        message: 'Assistants cannot unclaim customers. Please contact a supervisor or manager.'
      });
    }

    // Allow supervisors and managers to unclaim
    if (!['supervisor', 'manager', 'admin'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to unclaim customers'
      });
    }

    next();
  } catch (error) {
    console.error('Error validating unclaim permissions:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during unclaim validation'
    });
  }
};

/**
 * Validate assignment action and log audit trail
 */
const validateAndLogAssignment = async (req, res, next) => {
  try {
    const { customerId } = req.params;
    const { action } = req.body; // 'claim' or 'unclaim'
    const userId = req.user.id;

    if (!['claim', 'unclaim'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Must be either "claim" or "unclaim"'
      });
    }

    // Get customer and previous assignment info
    const customer = req.customer || await Customer.findById(customerId);
    const previousAssignment = {
      assignedTo: customer.assignedTo,
      assignmentStatus: customer.assignmentStatus,
      assignedAt: customer.assignedAt
    };

    // Create audit log entry
    const auditEntry = new AssignmentAudit({
      customerId: customerId,
      actionBy: userId,
      action: action,
      previousAssignment: previousAssignment,
      newAssignment: action === 'claim' ? {
        assignedTo: userId,
        assignmentStatus: 'assigned',
        assignedAt: new Date()
      } : {
        assignedTo: null,
        assignmentStatus: 'unassigned',
        assignedAt: null
      },
      timestamp: new Date(),
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    await auditEntry.save();

    // Attach audit entry to request for potential use in controller
    req.auditEntry = auditEntry;
    next();
  } catch (error) {
    console.error('Error logging assignment audit:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during audit logging'
    });
  }
};

/**
 * Validate assignment transfer (when transferring between assistants)
 */
const validateAssignmentTransfer = async (req, res, next) => {
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
        message: 'Only supervisors, managers, and admins can transfer customer assignments'
      });
    }

    // Check recipient's customer limit
    const recipientCustomerCount = await Customer.countDocuments({
      assignedTo: transferTo,
      assignmentStatus: 'assigned'
    });

    const maxLimit = recipient.maxCustomersLimit || 50;
    if (recipientCustomerCount >= maxLimit) {
      return res.status(400).json({
        success: false,
        message: `Cannot transfer. Recipient has reached maximum limit of ${maxLimit} customers`,
        recipientCurrentAssignments: recipientCustomerCount
      });
    }

    req.transferRecipient = recipient;
    next();
  } catch (error) {
    console.error('Error validating assignment transfer:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during transfer validation'
    });
  }
};

/**
 * Express validator rules for assignment requests
 */
const assignmentValidationRules = () => {
  return [
    body('action')
      .isIn(['claim', 'unclaim', 'transfer'])
      .withMessage('Action must be claim, unclaim, or transfer'),
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
  validateCustomerUnassigned,
  validateAssistantClaimPermissions,
  preventAssistantUnclaim,
  validateAndLogAssignment,
  validateAssignmentTransfer,
  assignmentValidationRules,
  handleValidationErrors
};