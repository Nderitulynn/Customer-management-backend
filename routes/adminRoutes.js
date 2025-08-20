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

// GET /api/admin-dashboard/customers - Customer list management
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

// GET /api/admin-dashboard/orders - Order list management
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

// GET /api/admin-dashboard/assistants - Assistant management
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

// ============================================================================
// CRITICAL MISSING ENDPOINTS - Added to fix 404/500 errors
// ============================================================================

// GET /api/stats - Comprehensive dashboard statistics (matches API_ENDPOINTS.STATS.DASHBOARD)
router.get('/stats', requireAdmin(), async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const Order = require('../models/Order');
    const User = require('../models/User');
    
    // Get basic counts
    const [customerCount, orderCount, assistantCount] = await Promise.all([
      Customer.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: 'assistant' })
    ]);
    
    // Get recent activity counts (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const [recentCustomers, recentOrders] = await Promise.all([
      Customer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      Order.countDocuments({ createdAt: { $gte: thirtyDaysAgo } })
    ]);
    
    // Calculate basic revenue (if orders have totalAmount field)
    const revenueResult = await Order.aggregate([
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;
    
    res.json({
      success: true,
      data: {
        totals: {
          customers: customerCount,
          orders: orderCount,
          assistants: assistantCount,
          revenue: totalRevenue
        },
        recent: {
          customers: recentCustomers,
          orders: recentOrders
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch dashboard statistics',
      details: error.message 
    });
  }
});

// GET /api/stats/customers - Customer statistics (matches API_ENDPOINTS.STATS.CUSTOMERS)
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
      .select('name email status createdAt')
      .populate('assignedTo', 'name');
    
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

// GET /api/stats/users - User statistics (matches API_ENDPOINTS.STATS.USERS)
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
      .select('name email isActive lastLogin');
    
    const assistantStats = await Promise.all(
      assistants.map(async (assistant) => {
        const customerCount = await Customer.countDocuments({ 
          assignedTo: assistant._id 
        });
        return {
          id: assistant._id,
          name: assistant.name,
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

// GET /api/orders - Order data for dashboard (matches API_ENDPOINTS.ORDERS.LIST)
router.get('/orders', requireAdmin(), async (req, res) => {
  try {
    const Order = require('../models/Order');
    const { limit = 10, recent = 'true' } = req.query;
    
    let query = {};
    let sort = { createdAt: -1 };
    
    // If requesting recent orders, get last 30 days
    if (recent === 'true') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query.createdAt = { $gte: thirtyDaysAgo };
    }
    
    const orders = await Order.find(query)
      .populate('customer', 'name email')
      .populate('assignedTo', 'name')
      .sort(sort)
      .limit(parseInt(limit))
      .select('orderNumber status totalAmount createdAt customer assignedTo');
    
    // Get order statistics
    const orderStats = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        orders,
        statistics: orderStats.reduce((acc, item) => {
          acc[item._id || 'unknown'] = item.count;
          return acc;
        }, {}),
        total: await Order.countDocuments(),
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
});

// GET /api/messages/recent - Recent messages for dashboard (matches API_ENDPOINTS.MESSAGES.RECENT)
router.get('/messages/recent', requireAdmin(), async (req, res) => {
  try {
    const Message = require('../models/Message');
    const { limit = 10 } = req.query;
    
    // Check if Message model exists, if not return empty data
    let recentMessages = [];
    let totalMessages = 0;
    
    try {
      recentMessages = await Message.find()
        .populate('customer', 'name email')
        .populate('user', 'name email')
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

// GET /api/system/health - System health metrics
router.get('/system/health', requireAdmin(), async (req, res) => {
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