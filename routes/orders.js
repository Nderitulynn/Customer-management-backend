const express = require('express');
const orderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

// Basic validation middleware for MongoDB ObjectId
const validateObjectId = (req, res, next) => {
  const { ObjectId } = require('mongoose').Types;
  
  if (req.params.id && !ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ 
      error: 'Invalid ID format' 
    });
  }
  
  if (req.params.customerId && !ObjectId.isValid(req.params.customerId)) {
    return res.status(400).json({ 
      error: 'Invalid customer ID format' 
    });
  }
  
  next();
};

// @route   GET /api/orders/stats
// @desc    Get order statistics for dashboard
// @access  Private (All authenticated users)
router.get('/stats', orderController.getDashboardStats);

// @route   GET /api/orders/activity
// @desc    Get recent order activity (for admin dashboard)
// @access  Private (All authenticated users)
router.get('/activity', authenticate, orderController.getRecentActivity);

// @route   GET /api/orders
// @desc    Get all orders with optional search and filtering
//          Query params: search, status, customerId (all optional)
// @access  Private (All authenticated users)
router.get('/', authenticate, orderController.getOrders);

// @route   POST /api/orders
// @desc    Create new order
//          Required: customerId, items, orderTotal
// @access  Private (All authenticated users)
router.post('/', authenticate, orderController.createOrder);

// @route   GET /api/orders/customer/:customerId
// @desc    Get all orders for specific customer
// @access  Private (All authenticated users)
router.get('/customer/:customerId', authenticate, validateObjectId, orderController.getCustomerOrders);

// @route   GET /api/orders/:id
// @desc    Get single order by ID
// @access  Private (All authenticated users)
router.get('/:id', authenticate, validateObjectId, orderController.getOrderById);

// @route   PUT /api/orders/:id
// @desc    Update order
// @access  Private (All authenticated users)
router.put('/:id', authenticate, validateObjectId, orderController.updateOrder);

// @route   PUT /api/orders/:id/status
// @desc    Update order status only
//          Required: status
// @access  Private (All authenticated users)
router.put('/:id/status', authenticate, validateObjectId, orderController.updateOrderStatus);

// @route   PUT /api/orders/:id/payment
// @desc    Update order payment information
//          Required: paymentAmount or paymentStatus
// @access  Private (All authenticated users)
router.put('/:id/payment', authenticate, validateObjectId, orderController.updateOrderPayment);

// @route   DELETE /api/orders/:id
// @desc    Delete order (soft delete)
// @access  Private (Admin only for safety)
router.delete('/:id', authenticate, authorize(['admin']), validateObjectId, orderController.deleteOrder);

module.exports = router;