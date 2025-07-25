const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation');

// Create an instance of ValidationMiddleware
const validator = new ValidationMiddleware();

// ===== ADMIN SETUP ROUTES =====

// Register admin (one-time setup, unprotected)
router.post('/register-admin', 
  validator.validateRequest('admin'),
  userController.registerAdmin
);

// Get all users (admin only - for debugging/management)
router.get('/', 
  authenticate,
  authorize(['admin']),
  userController.getAllUsers
);

// ===== ASSISTANT MANAGEMENT ROUTES (ADMIN ONLY) =====

// Create assistant (admin only)
router.post('/assistants', 
  authenticate,
  authorize(['admin']), 
  validator.validateRequest('assistant'),
  userController.createAssistant
);

// Get all assistants (admin only)
router.get('/assistants', 
  authenticate,
  authorize(['admin']),
  userController.getAllAssistants
);

// Get specific assistant by ID (admin only)
router.get('/assistants/:id', 
  authenticate,
  authorize(['admin']),
  userController.getAssistantDetails
);

// Update assistant (admin only)
router.put('/assistants/:id', 
  authenticate,
  authorize(['admin']),
  validator.validateRequest('profile'),
  userController.updateAssistant
);

// Delete assistant (admin only)
router.delete('/assistants/:id', 
  authenticate,
  authorize(['admin']),
  userController.deleteAssistant
);

// Toggle assistant status (admin only)
router.put('/assistants/:id/status', 
  authenticate,
  authorize(['admin']),
  userController.toggleAssistantStatus
);

// Reset assistant password (admin only)
router.put('/assistants/:id/reset-password', 
  authenticate,
  authorize(['admin']),
  userController.resetPassword
);

// ===== PROFILE ROUTES (ADMIN & ASSISTANT) =====

// Get own profile (both roles)
router.get('/profile', 
  authenticate,
  authorize(['admin', 'assistant']),
  userController.getMyProfile
);

// Update own profile (both roles)
router.put('/profile', 
  authenticate,
  authorize(['admin', 'assistant']),
  validator.validateRequest('profile'),
  userController.updateMyProfile
);

// Change own password (both roles)
router.put('/change-password', 
  authenticate,
  authorize(['admin', 'assistant']),
  validator.validateRequest('changePassword'),
  userController.changeMyPassword
);

// ===== CUSTOMER ASSIGNMENT ROUTES (ADMIN ONLY) =====

// Assign customer to assistant (admin only)
router.put('/assign-customer', 
  authenticate,
  authorize(['admin']),
  validator.validateRequest('assignCustomer'),
  userController.assignCustomer
);

// Unassign customer from assistant (admin only)
router.put('/unassign-customer', 
  authenticate,
  authorize(['admin']),
  validator.validateRequest('unassignCustomer'),
  userController.unassignCustomer
);

module.exports = router;