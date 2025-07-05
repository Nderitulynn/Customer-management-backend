// /routes/auth.js
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
  authenticate,
  requireActiveUser
} = require('../middleware/auth');

const router = express.Router();

// Validation middleware
const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('firstName')
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .trim(),
  body('lastName')
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .trim()
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// Routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/logout', authenticate, logout);
router.post('/refresh', authenticate, refreshToken);
router.get('/me', authenticate, requireActiveUser(), getCurrentUser);
router.put('/profile', authenticate, requireActiveUser(), updateProfile);
router.put('/password', authenticate, requireActiveUser(), changePassword);

module.exports = router;