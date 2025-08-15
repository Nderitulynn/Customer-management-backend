const express = require('express');
const router = express.Router();
const customerOrderController = require('../controllers/customerOrderController');
const { authenticate, authorize } = require('../middleware/auth');
const { USER_ROLES } = require('../models/User');

// Basic validation middleware for MongoDB ObjectId
const validateObjectId = (req, res, next) => {
  const { ObjectId } = require('mongoose').Types;
  
  if (req.params.orderId && !ObjectId.isValid(req.params.orderId)) {
    return res.status(400).json({ 
      success: false,
      message: 'Invalid order ID format' 
    });
  }
  
  next();
};

// Apply authentication to all routes
router.use(authenticate);

// Apply customer-only authorization to all routes
router.use(authorize([USER_ROLES.CUSTOMER]));

// STATIC ROUTES FIRST (no parameters)
// @route   GET /api/customer-orders
// @desc    Get all orders for the logged-in customer
// @access  Private (Customer only)
router.get('/', customerOrderController.getMyOrders);

// @route   GET /api/customer-orders/stats
// @desc    Get order statistics for customer dashboard
// @access  Private (Customer only)
router.get('/stats', customerOrderController.getOrderStats);

// @route   GET /api/customer-orders/recent
// @desc    Get recent orders for customer dashboard (last 5)
// @access  Private (Customer only)
router.get('/recent', customerOrderController.getRecentOrders);

// @route   GET /api/customer-orders/by-status/:status
// @desc    Get customer's orders filtered by status
// @access  Private (Customer only)
router.get('/by-status/:status', customerOrderController.getOrdersByStatus);

// POST ROUTES
// @route   POST /api/customer-orders
// @desc    Create new order for the logged-in customer
// @access  Private (Customer only)
router.post('/', customerOrderController.createOrder);

// PARAMETERIZED ROUTES (after static routes to avoid conflicts)
// @route   GET /api/customer-orders/:orderId
// @desc    Get specific order details (only if belongs to customer)
// @access  Private (Customer only)
router.get('/:orderId', validateObjectId, customerOrderController.getOrderDetails);

// @route   PUT /api/customer-orders/:orderId/cancel
// @desc    Cancel order (only if pending and belongs to customer)
// @access  Private (Customer only)
router.put('/:orderId/cancel', validateObjectId, customerOrderController.cancelOrder);

// @route   PUT /api/customer-orders/:orderId/reorder
// @desc    Create a new order based on an existing order
// @access  Private (Customer only)
router.put('/:orderId/reorder', validateObjectId, customerOrderController.reorderOrder);

module.exports = router;