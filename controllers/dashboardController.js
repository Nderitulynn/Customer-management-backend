const Order = require('../models/Order');
const Customer = require('../models/Customer');

// Cache for 5 minutes
const CACHE_DURATION = 5 * 60 * 1000;
const cache = new Map();

const dashboardController = {
  // Admin Dashboard
  async getAdminDashboard(req, res) {
    try {
      const cacheKey = 'admin_dashboard';
      const cached = cache.get(cacheKey);
      
      if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return res.json(cached.data);
      }

      const [revenueData, customerGrowth, orderVolumes] = await Promise.all([
        getRevenueData(),
        getCustomerGrowth(),
        getOrderVolumes()
      ]);

      const data = {
        revenue: revenueData,
        customerGrowth,
        orderVolumes
      };

      cache.set(cacheKey, { data, timestamp: Date.now() });
      res.json(data);
    } catch (error) {
      console.error('Admin dashboard error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Assistant Dashboard - Simplified
  async getAssistantDashboard(req, res) {
    try {
      const assistantId = req.user.id;
      
      // Get assigned customers for this assistant
      const assignedCustomers = await Customer.find({ assignedTo: assistantId })
        .select('_id fullName email phone status')
        .limit(50);
      
      const customerIds = assignedCustomers.map(customer => customer._id);
      
      const [recentOrders, customerStats] = await Promise.all([
        Order.find({ customerId: { $in: customerIds } })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('customerId', 'fullName email'),
        getAssistantStats(assistantId, customerIds)
      ]);

      res.json({
        recentOrders,
        assignedCustomers,
        stats: customerStats,
        notifications: [] // Empty for now
      });
    } catch (error) {
      console.error('Assistant dashboard error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Quick Stats - Simplified
  async getQuickStats(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let todayOrders, activeCustomers, totalRevenue;

      if (req.user.role === 'admin') {
        // Admin sees all data
        [todayOrders, activeCustomers, totalRevenue] = await Promise.all([
          Order.countDocuments({ createdAt: { $gte: today } }),
          Customer.countDocuments({ status: 'active' }),
          Order.aggregate([
            { $match: { status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ]).then(result => result[0]?.total || 0)
        ]);
      } else {
        // Assistant sees only assigned customers' data
        const assignedCustomers = await Customer.find({ assignedTo: req.user.id }).select('_id');
        const customerIds = assignedCustomers.map(customer => customer._id);

        [todayOrders, activeCustomers, totalRevenue] = await Promise.all([
          Order.countDocuments({ 
            customerId: { $in: customerIds }, 
            createdAt: { $gte: today } 
          }),
          Customer.countDocuments({ 
            assignedTo: req.user.id, 
            status: 'active' 
          }),
          Order.aggregate([
            { $match: { customerId: { $in: customerIds }, status: 'completed' } },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } }
          ]).then(result => result[0]?.total || 0)
        ]);
      }

      res.json({
        todayOrders,
        activeCustomers,
        totalRevenue
      });
    } catch (error) {
      console.error('Quick stats error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Recent Activity Feed
  async getRecentActivity(req, res) {
    try {
      const userType = req.user.role;
      const userId = req.user.id;

      let activities = [];

      if (userType === 'admin') {
        activities = await Order.find()
          .sort({ createdAt: -1 })
          .limit(20)
          .populate('customerId', 'fullName email')
          .select('orderNumber status createdAt customerId totalAmount');
      } else {
        // Assistant only sees orders from assigned customers
        const assignedCustomers = await Customer.find({ assignedTo: userId }).select('_id');
        const customerIds = assignedCustomers.map(customer => customer._id);

        activities = await Order.find({ customerId: { $in: customerIds } })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate('customerId', 'fullName email')
          .select('orderNumber status createdAt customerId totalAmount');
      }

      res.json(activities);
    } catch (error) {
      console.error('Recent activity error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get assigned customers for assistant
  async getAssignedCustomers(req, res) {
    try {
      if (req.user.role !== 'assistant') {
        return res.status(403).json({ error: 'Access denied. Assistant role required.' });
      }

      const customers = await Customer.find({ assignedTo: req.user.id })
        .select('fullName email phone status createdAt')
        .sort({ createdAt: -1 });

      res.json(customers);
    } catch (error) {
      console.error('Get assigned customers error:', error);
      res.status(500).json({ error: error.message });
    }
  },

  // Get customer details for assistant
  async getCustomerDetails(req, res) {
    try {
      const customerId = req.params.id;
      
      // Check if customer is assigned to this assistant
      let customer;
      if (req.user.role === 'admin') {
        customer = await Customer.findById(customerId);
      } else {
        customer = await Customer.findOne({ 
          _id: customerId, 
          assignedTo: req.user.id 
        });
      }

      if (!customer) {
        return res.status(404).json({ error: 'Customer not found or not assigned to you' });
      }

      // Get customer's orders
      const orders = await Order.find({ customerId: customerId })
        .sort({ createdAt: -1 })
        .limit(10);

      res.json({
        customer,
        orders
      });
    } catch (error) {
      console.error('Get customer details error:', error);
      res.status(500).json({ error: error.message });
    }
  }
};

// Helper functions
async function getRevenueData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return await Order.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo }, status: 'completed' } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        revenue: { $sum: "$totalAmount" }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function getCustomerGrowth() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return await Customer.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        newCustomers: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

async function getOrderVolumes() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return await Order.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        orders: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);
}

// Get assistant-specific stats
async function getAssistantStats(assistantId, customerIds) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalCustomers, activeOrders, completedOrdersToday] = await Promise.all([
      Customer.countDocuments({ assignedTo: assistantId }),
      Order.countDocuments({ 
        customerId: { $in: customerIds }, 
        status: { $in: ['pending', 'processing'] } 
      }),
      Order.countDocuments({ 
        customerId: { $in: customerIds }, 
        status: 'completed',
        createdAt: { $gte: today }
      })
    ]);

    return {
      totalCustomers,
      activeOrders,
      completedOrdersToday,
      pendingTasks: 0 // Will be 0 until Task model is implemented
    };
  } catch (error) {
    console.error('Error getting assistant stats:', error);
    return {
      totalCustomers: 0,
      activeOrders: 0,
      completedOrdersToday: 0,
      pendingTasks: 0
    };
  }
}

module.exports = dashboardController;