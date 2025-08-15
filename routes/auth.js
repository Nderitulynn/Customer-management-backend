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
  logout,
  verifyToken,
  registerCustomer  // ADD THIS IMPORT
} = require('../controllers/authController');
const {
  authenticate,
  requireActiveUser
} = require('../middleware/auth');

const router = express.Router();

// Validation middleware for admin/staff registration
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

// Validation middleware for customer registration
const customerRegisterValidation = [
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
router.post('/register-customer', customerRegisterValidation, registerCustomer);
router.post('/login', loginValidation, login);
router.post('/logout', authenticate, logout);
router.post('/refresh', authenticate, refreshToken);
router.get('/me', authenticate, requireActiveUser(), getCurrentUser);

// UPDATED: Use the new verifyToken method from controller
router.get('/verify', authenticate, verifyToken);

// router.post('/verify-token', authenticate, (req, res) => {
//   res.json({
//     success: true,
//     valid: true,
//     user: req.user
//   });
// });

router.put('/profile', authenticate, requireActiveUser(), updateProfile);
router.put('/password', authenticate, requireActiveUser(), changePassword);

module.exports = router;