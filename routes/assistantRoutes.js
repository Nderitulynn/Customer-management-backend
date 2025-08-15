const express = require('express');
const router = express.Router();
const { requireAssistant } = require('../middleware/auth');

// GET /api/assistant/customers - Assigned customers
router.get('/customers', requireAssistant(), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const { page = 1, limit = 20, status, search } = req.query;
    
    const query = { assignedTo: req.user.id };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [customers, totalCount] = await Promise.all([
      Customer.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('name email phone status createdAt updatedAt'),
      Customer.countDocuments(query)
    ]);
    
    res.json({
      customers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch customers',
      details: error.message 
    });
  }
});

// GET /api/assistant/orders - Orders for assigned customers
router.get('/orders', requireAssistant(), async (req, res) => {
  try {
    const Order = require('../models/Order');
    const { page = 1, limit = 20, status } = req.query;
    
    const query = { assignedTo: req.user.id };
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .populate('customer', 'name email phone')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('orderNumber status totalAmount createdAt updatedAt customer'),
      Order.countDocuments(query)
    ]);
    
    res.json({
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// PUT /api/assistant/orders/:id/status - Update order status
router.put('/orders/:id/status', requireAssistant(), async (req, res) => {
  try {
    const Order = require('../models/Order');
    const { id } = req.params;
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses 
      });
    }
    
    // Find order and verify it's assigned to this assistant
    const order = await Order.findOne({
      _id: id,
      assignedTo: req.user.id
    });
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found or not assigned to you' 
      });
    }
    
    // Update order status
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { 
        status,
        notes: notes || order.notes,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('customer', 'name email');
    
    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
});

// GET /api/assistant/profile - Personal profile
router.get('/profile', requireAssistant(), async (req, res) => {
  try {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const Order = require('../models/Order');
    
    // Get user profile
    const user = await User.findById(req.user.id)
      .select('name email createdAt lastLogin isActive');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get basic statistics
    const [customerCount, orderCount] = await Promise.all([
      Customer.countDocuments({ assignedTo: req.user.id }),
      Order.countDocuments({ assignedTo: req.user.id })
    ]);
    
    res.json({
      profile: user,
      stats: {
        assignedCustomers: customerCount,
        totalOrders: orderCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch profile',
      details: error.message 
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Assistant route error:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID format',
      details: error.message
    });
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

module.exports = router;