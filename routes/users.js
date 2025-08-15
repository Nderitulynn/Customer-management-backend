const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../models/User');

// Only include ValidationMiddleware if it exists
let validator;
try {
  const ValidationMiddleware = require('../middleware/validation');
  validator = new ValidationMiddleware();
} catch (error) {
  console.log('ValidationMiddleware not found, routes will work without validation');
  validator = {
    validateRequest: () => (req, res, next) => next() // No-op middleware
  };
}

// ===== ADMIN SETUP ROUTES (UNPROTECTED) =====

// @route   POST /api/users/register-admin
// @desc    Register admin (one-time setup)
// @access  Public (unprotected for initial setup)
router.post('/register-admin', 
  validator.validateRequest('admin'),
  userController.registerAdmin
);

// ===== PROFILE ROUTES (AUTHENTICATED USERS) =====

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private (Admin & Assistant)
router.get('/profile', 
  authenticate,
  userController.getMyProfile
);

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private (Admin & Assistant)
router.put('/profile', 
  authenticate,
  validator.validateRequest('profile'),
  userController.updateMyProfile
);

// @route   PUT /api/users/change-password
// @desc    Change current user's password
// @access  Private (Admin & Assistant)
router.put('/change-password', 
  authenticate,
  validator.validateRequest('changePassword'),
  userController.changeMyPassword
);

// ===== ASSISTANT MANAGEMENT ROUTES (ADMIN ONLY) =====

// @route   GET /api/users/assistants
// @desc    Get all assistants
// @access  Private (Admin only)
router.get('/assistants', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.getAllAssistants
);

// @route   POST /api/users/assistants
// @desc    Create new assistant
// @access  Private (Admin only)
router.post('/assistants', 
  authenticate,
  authorize([USER_ROLES.ADMIN]), 
  validator.validateRequest('assistant'),
  userController.createAssistant
);

// @route   GET /api/users/assistants/:id
// @desc    Get specific assistant by ID with customer details
// @access  Private (Admin only)
router.get('/assistants/:id', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.getAssistantDetails
);

// @route   PUT /api/users/assistants/:id
// @desc    Update assistant details
// @access  Private (Admin only)
router.put('/assistants/:id', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  validator.validateRequest('profile'),
  userController.updateAssistant
);

// @route   DELETE /api/users/assistants/:id
// @desc    Delete assistant (hard delete with customer unassignment)
// @access  Private (Admin only)
router.delete('/assistants/:id', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.deleteAssistant
);

// @route   PUT /api/users/assistants/:id/status
// @desc    Toggle assistant active/inactive status
// @access  Private (Admin only)
router.put('/assistants/:id/status', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.toggleAssistantStatus
);

// @route   PUT /api/users/assistants/:id/reset-password
// @desc    Reset assistant password and generate new one
// @access  Private (Admin only)
router.put('/assistants/:id/reset-password', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.resetPassword
);

// ===== CUSTOMER ASSIGNMENT ROUTES (ADMIN ONLY) =====

// @route   PUT /api/users/assign-customer
// @desc    Assign customer to assistant
//          Body: { customerId: ObjectId, assistantId: ObjectId }
// @access  Private (Admin only)
router.put('/assign-customer', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  validator.validateRequest('assignCustomer'),
  userController.assignCustomer
);

// @route   PUT /api/users/unassign-customer
// @desc    Unassign customer from assistant
//          Body: { customerId: ObjectId }
// @access  Private (Admin only)
router.put('/unassign-customer', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  validator.validateRequest('unassignCustomer'),
  userController.unassignCustomer
);

// ===== GENERAL USER MANAGEMENT ROUTES (ADMIN ONLY) =====

// @route   GET /api/users
// @desc    Get all users (for debugging/management)
// @access  Private (Admin only)
router.get('/', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.getAllUsers
);

module.exports = router;