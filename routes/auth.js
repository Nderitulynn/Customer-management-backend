// backend/routes/auth.js
const express = require('express');
const { body } = require('express-validator');
const {
  register,
  login,
  getCurrentUser,
  updateProfile,
  changePassword,
  refreshToken,
  logout
} = require('../controllers/authController');
const {
  requireAuth,
  requireAdmin,
  requireAssistant,
  requireActiveUser
} = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 20 })
    .withMessage('Username must be between 3 and 20 characters')
    .matches(/^[a-zA-Z0-9]+$/)
    .withMessage('Username can only contain letters and numbers'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Password must contain letters, numbers, and special characters'),
  body('fullName')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .trim(),
  body('role')
    .optional()
    .isIn(['admin', 'assistant'])
    .withMessage('Role must be admin or assistant')
];

const loginValidation = [
  body('login')
    .notEmpty()
    .withMessage('Username or email is required')
    .trim(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

const profileUpdateValidation = [
  body('fullName')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
    .trim(),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail()
];

const passwordChangeValidation = [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('New password must contain letters, numbers, and special characters')
];

// @route   POST /api/auth/register
// @desc    User registration
// @access  Public
router.post('/register', registerValidation, register);

// @route   POST /api/auth/login
// @desc    User login
// @access  Public
router.post('/login', loginValidation, login);

// @route   POST /api/auth/logout
// @desc    User logout
// @access  Private
router.post('/logout', requireAuth(), logout);

// @route   POST /api/auth/refresh
// @desc    Refresh JWT token
// @access  Public
router.post('/refresh', refreshToken);

// @route   GET /api/auth/me
// @desc    Get current user profile
// @access  Private
router.get('/me', requireActiveUser(), getCurrentUser);

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', requireActiveUser(), profileUpdateValidation, updateProfile);

// @route   PUT /api/auth/password
// @desc    Change password
// @access  Private
router.put('/password', requireActiveUser(), passwordChangeValidation, changePassword);

module.exports = router;