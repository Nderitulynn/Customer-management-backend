const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');

// GET /api/admin/stats - Simple system overview
router.get('/stats', requireAdmin(), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const Order = require('../models/Order');
    const User = require('../models/User');
    
    const [customerCount, orderCount, assistantCount] = await Promise.all([
      Customer.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: 'assistant' })
    ]);
    
    res.json({
      customerCount,
      orderCount,
      assistantCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch stats',
      details: error.message 
    });
  }
});

// GET /api/admin/customers - Customer list management
router.get('/customers', requireAdmin(), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const { page = 1, limit = 20, search, status } = req.query;
    
    const query = {};
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [customers, totalCount] = await Promise.all([
      Customer.find(query)
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('name email phone status createdAt assignedTo'),
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

// GET /api/admin/orders - Order list management
router.get('/orders', requireAdmin(), async (req, res) => {
  try {
    const Order = require('../models/Order');
    const { page = 1, limit = 20, status, search } = req.query;
    
    const query = {};
    
    if (status && status !== 'all') {
      query.status = status;
    }
    
    if (search) {
      query.orderNumber = { $regex: search, $options: 'i' };
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .populate('customer', 'name email')
        .populate('assignedTo', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('orderNumber status totalAmount createdAt customer assignedTo'),
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

// GET /api/admin/assistants - Assistant management
router.get('/assistants', requireAdmin(), async (req, res) => {
  try {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const { page = 1, limit = 20, search } = req.query;
    
    const query = { role: 'assistant' };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [assistants, totalCount] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('name email isActive createdAt lastLogin'),
      User.countDocuments(query)
    ]);

    // POST /api/admin-dashboard/assistants - Create new assistant
router.post('/assistants', requireAdmin(), async (req, res) => {
  try {
    const userController = require('../controllers/userController');
    const ValidationMiddleware = require('../middleware/validation');
    const validator = new ValidationMiddleware();
    
    // Validate the request
    const validatedData = validator.validateAssistant(req.body, req.user.role);
    req.validatedData = validatedData;
    req.body = validatedData;
    
    return userController.createAssistant(req, res);
  } catch (error) {
    res.status(400).json({ 
      error: error.message,
      details: 'Assistant creation validation failed' 
    });
  }
});
    
    // Get customer count for each assistant
    const assistantsWithStats = await Promise.all(
      assistants.map(async (assistant) => {
        const customerCount = await Customer.countDocuments({ 
          assignedTo: assistant._id 
        });
        return {
          ...assistant.toObject(),
          customerCount
        };
      })
    );
    
    res.json({
      assistants: assistantsWithStats,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch assistants',
      details: error.message 
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  console.error('Admin route error:', error);
  
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