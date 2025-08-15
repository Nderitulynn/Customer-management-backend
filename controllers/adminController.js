const Customer = require('../models/Customer');
const Order = require('../models/Order');
const User = require('../models/User');

// Get simple system statistics
const getSystemStats = async (req, res) => {
  try {
    const [customerCount, orderCount, assistantCount] = await Promise.all([
      Customer.countDocuments(),
      Order.countDocuments(),
      User.countDocuments({ role: 'assistant' })
    ]);
    
    // Get basic order status breakdown
    const orderStats = await Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Format order stats for easier consumption
    const orderStatusCounts = orderStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {});
    
    res.json({
      customerCount,
      orderCount,
      assistantCount,
      orderStatusCounts,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch system stats',
      details: error.message 
    });
  }
};

// Get customer list with basic filtering
const getCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    
    const query = {};
    
    // Basic search functionality
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Status filtering
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
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch customers',
      details: error.message 
    });
  }
};

// Get order list with status filtering
const getOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    const query = {};
    
    // Status filtering
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Basic search by order number
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
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};

// Get assistant list for management
const getAssistants = async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    
    const query = { role: 'assistant' };
    
    // Basic search functionality
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
    
    // Get customer count for each assistant (basic metric)
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
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch assistants',
      details: error.message 
    });
  }
};

module.exports = {
  getSystemStats,
  getCustomers,
  getOrders,
  getAssistants
};