const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');

// GET /api/admin-dashboard/stats - Simple system overview
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



// GET /api/admin-dashboard/stats/orders - Order statistics
router.get('/stats/orders', requireAdmin(), async (req, res) => {
  try {
    const Order = require('../models/Order');
    
    // Get total order count
    const total = await Order.countDocuments();
    
    // Get status distribution
    const statusDistribution = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    // Get payment status distribution
    const paymentStatusDistribution = await Order.aggregate([
      { $group: { _id: "$paymentStatus", count: { $sum: 1 } } }
    ]);
    
    // Get total revenue
    const revenueStats = await Order.aggregate([
      { $group: { _id: null, totalRevenue: { $sum: "$orderTotal" } } }
    ]);
    
    // Get order growth (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const monthlyGrowth = await Order.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      { 
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 },
          revenue: { $sum: "$orderTotal" }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Get recent orders (last 10) - basic info only
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderNumber status orderTotal createdAt paymentStatus')
      .populate('customerId', 'fullName')
      .populate('createdBy', 'fullName');
    
    res.json({
      success: true,
      data: {
        total,
        statusDistribution: statusDistribution.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        paymentStatusDistribution: paymentStatusDistribution.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        totalRevenue: revenueStats.length > 0 ? revenueStats[0].totalRevenue : 0,
        monthlyGrowth,
        recentOrders,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch order statistics',
      details: error.message 
    });
  }
});

// GET /api/admin-dashboard/assistants - Assistant management
router.get('/assistants', requireAdmin(), async (req, res) => {
  try {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    const { page = 1, limit = 20, search } = req.query;
    
    const query = { role: 'assistant' };
    
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [assistants, totalCount] = await Promise.all([
      User.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('fullName email isActive createdAt lastLogin'),
      User.countDocuments(query)
    ]);
    
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

// GET /api/admin-dashboard/stats/customers - Customer statistics (matches API_ENDPOINTS.STATS.CUSTOMERS)
router.get('/stats/customers', requireAdmin(), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    
    // Get total customer count
    const total = await Customer.countDocuments();
    
    // Get status distribution
    const statusDistribution = await Customer.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    // Get customer growth (last 12 months)
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    
    const monthlyGrowth = await Customer.aggregate([
      { $match: { createdAt: { $gte: twelveMonthsAgo } } },
      { 
        $group: {
          _id: { 
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } }
    ]);
    
    // Get recent customers (last 10)
    const recentCustomers = await Customer.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .select('fullName email status createdAt')
      .populate('assignedTo', 'fullName');
    
    res.json({
      success: true,
      data: {
        total,
        statusDistribution: statusDistribution.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        monthlyGrowth,
        recentCustomers,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch customer statistics',
      details: error.message 
    });
  }
});

// GET /api/admin-dashboard/stats/users - User statistics (matches API_ENDPOINTS.STATS.USERS)
router.get('/stats/users', requireAdmin(), async (req, res) => {
  try {
    const User = require('../models/User');
    const Customer = require('../models/Customer');
    
    // Get user counts by role
    const userStats = await User.aggregate([
      { $group: { _id: "$role", count: { $sum: 1 } } }
    ]);
    
    // Get assistant performance stats
    const assistants = await User.find({ role: 'assistant' })
      .select('fullName email isActive lastLogin');
    
    const assistantStats = await Promise.all(
      assistants.map(async (assistant) => {
        const customerCount = await Customer.countDocuments({ 
          assignedTo: assistant._id 
        });
        return {
          id: assistant._id,
          name: assistant.fullName,
          email: assistant.email,
          isActive: assistant.isActive,
          lastLogin: assistant.lastLogin,
          customerCount
        };
      })
    );
    
    res.json({
      success: true,
      data: {
        userDistribution: userStats.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}),
        totalUsers: userStats.reduce((sum, item) => sum + item.count, 0),
        assistantStats,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch user statistics',
      details: error.message 
    });
  }
});

// GET /api/messages/recent - Recent messages for dashboard (FIXED ROUTE PATH)
router.get('/recent', requireAdmin(), async (req, res) => {
  try {
    const Message = require('../models/Message');
    const { limit = 10 } = req.query;
    
    // Check if Message model exists, if not return empty data
    let recentMessages = [];
    let totalMessages = 0;
    
    try {
      recentMessages = await Message.find()
        .populate('customer', 'fullName email')
        .populate('user', 'fullName email')
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .select('content type status createdAt customer user');
      
      totalMessages = await Message.countDocuments();
    } catch (modelError) {
      // If Message model doesn't exist, return mock data structure
      console.log('Message model not found, returning empty data');
    }
    
    res.json({
      success: true,
      data: {
        messages: recentMessages,
        total: totalMessages,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch recent messages',
      details: error.message 
    });
  }
});

// GET /api/health - System health metrics (FIXED ROUTE PATH)
router.get('/', requireAdmin(), async (req, res) => {
  try {
    const mongoose = require('mongoose');
    
    // Database connection status
    const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    
    // Get basic system metrics
    const Customer = require('../models/Customer');
    const Order = require('../models/Order');
    const User = require('../models/User');
    
    const [customerCount, orderCount, userCount] = await Promise.all([
      Customer.countDocuments(),
      Order.countDocuments(),
      User.countDocuments()
    ]);
    
    // Server uptime
    const uptime = process.uptime();
    
    // Memory usage
    const memoryUsage = process.memoryUsage();
    
    res.json({
      success: true,
      data: {
        status: 'healthy',
        database: {
          status: dbStatus,
          collections: {
            customers: customerCount,
            orders: orderCount,
            users: userCount
          }
        },
        server: {
          uptime: uptime,
          memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024)
          }
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      status: 'unhealthy',
      error: 'Failed to fetch system health',
      details: error.message,
      timestamp: new Date().toISOString()
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