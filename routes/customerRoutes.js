const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../models/User');

// Apply authentication to all routes
router.use(authenticate);

// @route   GET /api/customer/dashboard
// @desc    Get customer dashboard data
// @access  Private (Customer only)
router.get('/dashboard', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.getDashboard
);

// @route   GET /api/customer/profile
// @desc    Get customer's own profile
// @access  Private (Customer only)
router.get('/profile', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.getProfile
);

// @route   PUT /api/customer/profile
// @desc    Update customer's own profile
// @access  Private (Customer only)
router.put('/profile', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.updateProfile
);

// @route   GET /api/customer/orders
// @desc    Get customer's own orders
// @access  Private (Customer only)
router.get('/orders', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.getMyOrders
);

// @route   GET /api/customer/orders/:orderId
// @desc    Get specific order details (if belongs to customer)
// @access  Private (Customer only)
router.get('/orders/:orderId', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.getOrderDetails
);

// @route   POST /api/customer/orders
// @desc    Create new order for customer
// @access  Private (Customer only)
router.post('/orders', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.createOrder
);

// @route   PUT /api/customer/orders/:orderId/cancel
// @desc    Cancel order (if pending and belongs to customer)
// @access  Private (Customer only)
router.put('/orders/:orderId/cancel', 
 authorize([USER_ROLES.CUSTOMER]), 
 customerController.cancelOrder
);

module.exports = router;