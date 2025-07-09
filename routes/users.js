const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const ValidationMiddleware = require('../middleware/validation'); // Import the class

// Create an instance of ValidationMiddleware
const validator = new ValidationMiddleware();

// ===== BASE USERS ROUTE =====

// Get all users (admin only) - This handles /api/users
router.get('/', 
  authenticate,
  authorize(['admin']),
  userController.getAllUsers
);

// ===== ADMIN ROUTES =====

// Register admin (one-time setup - no auth required)
router.post('/admin/register', userController.registerAdmin);

// Assistant management (admin only)
router.post('/assistants', 
  authenticate,
  authorize(['admin']), 
  validator.validateRequest('assistant'), // Use the correct method
  userController.createAssistant
);

router.get('/assistants', 
  authenticate,
  authorize(['admin']),
  userController.getAllAssistants
);

router.get('/assistants/:id', 
  authenticate,
  authorize(['admin']),
  userController.getAssistantDetails
);

router.put('/assistants/:id', 
  authenticate,
  authorize(['admin']),
  validator.validateRequest('assistant'), // Use the correct method
  userController.updateAssistant
);

router.delete('/assistants/:id', 
  authenticate,
  authorize(['admin']),
  userController.deleteAssistant
);

// Assistant status management (admin only)
router.patch('/assistants/:id/toggle-status', 
  authenticate,
  authorize(['admin']),
  userController.toggleAssistantStatus
);

router.patch('/assistants/:id/reset-password', 
  authenticate,
  authorize(['admin']),
  userController.resetPassword
);

// Performance and analytics (admin only)
router.get('/assistants/:id/performance', 
  authenticate,
  authorize(['admin']),
  userController.getAssistantPerformance
);

// Bulk operations (admin only)
router.post('/assistants/bulk-assign', 
  authenticate,
  authorize(['admin']),
  userController.bulkAssignCustomers
);

router.post('/assistants/reassign', 
  authenticate,
  authorize(['admin']),
  userController.reassignCustomers
);

// ===== ASSISTANT SELF-SERVICE ROUTES =====

// Profile management (assistant only)
router.get('/profile', 
  authenticate,
  authorize(['assistant']),
  userController.getMyProfile
);

router.put('/profile', 
  authenticate,
  authorize(['assistant']),
  userController.updateMyProfile
);

router.patch('/change-password', 
  authenticate,
  authorize(['assistant']),
  userController.changeMyPassword
);

// Assistant can view their own performance
router.get('/my-performance', 
  authenticate,
  authorize(['assistant']),
  (req, res) => {
    req.params.id = req.user.id;
    userController.getAssistantPerformance(req, res);
  }
);

// ===== MIXED ACCESS ROUTES =====

// Both admin and assistant can access these
router.get('/me', 
  authenticate,
  authorize(['admin', 'assistant']),
  userController.getMyProfile
);

module.exports = router;