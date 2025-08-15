const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../models/User');

// Apply authentication to all routes
router.use(authenticate);

// @route   GET /api/customers/stats
// @desc    Get customer statistics for dashboard
// @access  Private (All authenticated users)
router.get('/stats', customerController.getDashboardStats);

// @route   GET /api/customers/assistants/available
// @desc    Get available assistants for customer assignment
// @access  Private (Admin only)
router.get('/assistants/available', 
  authorize([USER_ROLES.ADMIN]), 
  customerController.getAvailableAssistants
);

// @route   GET /api/customers/by-assistant/:assistantId
// @desc    Get customers assigned to a specific assistant
// @access  Private (Admin only)
router.get('/by-assistant/:assistantId', 
  authorize([USER_ROLES.ADMIN]), 
  customerController.getAssignedCustomers
);

// @route   GET /api/customers/unassigned
// @desc    Get customers that are not assigned to any assistant
// @access  Private (Admin only)
router.get('/unassigned', 
  authorize([USER_ROLES.ADMIN]), 
  customerController.getUnassignedCustomers
);

// @route   GET /api/customers
// @desc    Get all customers with optional search and filtering
//          Query params: search (optional), page (optional), limit (optional)
// @access  Private (All authenticated users)
router.get('/', customerController.getCustomers);

// @route   POST /api/customers
// @desc    Create new customer
// @access  Private (All authenticated users)
router.post('/', customerController.createCustomer);

// @route   GET /api/customers/:id
// @desc    Get single customer by ID
// @access  Private (All authenticated users)
router.get('/:id', customerController.getCustomerById);

// @route   PUT /api/customers/:id
// @desc    Update customer information
// @access  Private (All authenticated users)
router.put('/:id', customerController.updateCustomer);

// @route   POST /api/customers/:id/assign
// @desc    Assign customer to an assistant
//          Body: { assistantId: ObjectId }
// @access  Private (Admin only)
router.post('/:id/assign', 
  authorize([USER_ROLES.ADMIN]), 
  customerController.assignCustomer
);

// @route   DELETE /api/customers/:id
// @desc    Delete customer (soft delete)
// @access  Private (Admin only)
router.delete('/:id', 
  authorize([USER_ROLES.ADMIN]), 
  customerController.deleteCustomer
);

module.exports = router;