// /routes/users.js
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

// ===== PROFILE MANAGEMENT ROUTES =====

// @route   GET /api/users/profile
// @desc    Get current user's profile
// @access  Private (All authenticated users)
router.get('/profile', 
  authenticate,
  userController.getMyProfile
);

// @route   PUT /api/users/profile
// @desc    Update current user's profile
// @access  Private (All authenticated users)
router.put('/profile', 
  authenticate,
  validator.validateRequest('profile'),
  userController.updateMyProfile
);

// @route   PUT /api/users/change-password
// @desc    Change current user's password
// @access  Private (All authenticated users)
router.put('/change-password', 
  authenticate,
  userController.changeMyPassword
);

// ===== USER ADMINISTRATION ROUTES (ADMIN ONLY) =====

// @route   GET /api/users
// @desc    Get all users with filtering and pagination
// @access  Private (Admin only)
router.get('/', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.getAllUsers
);

// ===== ASSISTANT MANAGEMENT ROUTES (ADMIN ONLY) =====

// @route   GET /api/users/assistants
// @desc    Get all assistants with their statistics
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
// @desc    Delete assistant (with customer unassignment)
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
// @desc    Reset assistant password (admin function)
// @access  Private (Admin only)
router.put('/assistants/:id/reset-password', 
  authenticate,
  authorize([USER_ROLES.ADMIN]),
  userController.resetPassword
);

module.exports = router;