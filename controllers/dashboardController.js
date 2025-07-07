const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Task = require('../models/Task');
const Payment = require('../models/Payment');

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

      const [revenueData, profitData, customerGrowth, orderVolumes] = await Promise.all([
        getRevenueData(),
        getProfitData(),
        getCustomerGrowth(),
        getOrderVolumes()
      ]);

      const data = {
        revenue: revenueData,
        profit: profitData,
        customerGrowth,
        orderVolumes
      };

      cache.set(cacheKey, { data, timestamp: Date.now() });
      res.json(data);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Assistant Dashboard - FIXED
  async getAssistantDashboard(req, res) {
    try {
      const assistantId = req.user.id;
      
      // Get assigned customers for this assistant
      const assignedCustomers = await Customer.find({ assignedTo: assistantId })
        .select('_id fullName email phone status');
      
      const customerIds = assignedCustomers.map(customer => customer._id);
      
      const [assignedTasks, recentOrders, notifications, customerStats] = await Promise.all([
        Task.find({ assignedTo: assistantId, status: { $in: ['pending', 'in_progress'] } })
          .sort({ createdAt: -1 })
          .limit(10),
        Order.find({ customerId: { $in: customerIds } })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('customerId', 'fullName email'),
        getNotifications(assistantId),
        getAssistantStats(assistantId, customerIds)
      ]);

      res.json({
        assignedTasks,
        recentOrders,
        notifications,
        assignedCustomers,
        stats: customerStats
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Quick Stats - FIXED for role-based access
  async getQuickStats(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let todayOrders, activeCustomers, pendingPayments;

      if (req.user.role === 'admin') {
        // Admin sees all data
        [todayOrders, activeCustomers, pendingPayments] = await Promise.all([
          Order.countDocuments({ createdAt: { $gte: today } }),
          Customer.countDocuments({ status: 'active' }),
          Payment.countDocuments({ status: 'pending' })
        ]);
      } else {
        // Assistant sees only assigned customers' data
        const assignedCustomers = await Customer.find({ assignedTo: req.user.id }).select('_id');
        const customerIds = assignedCustomers.map(customer => customer._id);

        [todayOrders, activeCustomers, pendingPayments] = await Promise.all([
          Order.countDocuments({ 
            customerId: { $in: customerIds }, 
            createdAt: { $gte: today } 
          }),
          Customer.countDocuments({ 
            assignedTo: req.user.id, 
            status: 'active' 
          }),
          Payment.countDocuments({ 
            customerId: { $in: customerIds }, 
            status: 'pending' 
          })
        ]);
      }

      res.json({
        todayOrders,
        activeCustomers,
        pendingPayments
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Recent Activity Feed - FIXED
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
      res.status(500).json({ error: error.message });
    }
  },

  // NEW: Get assigned customers for assistant
  async getAssignedCustomers(req, res) {
    try {
      if (req.user.role !== 'assistant') {
        return res.status(403).json({ error: 'Access denied. Assistant role required.' });
      }

      const customers = await Customer.find({ assignedTo: req.user.id })
        .select('fullName email phone status createdAt lastContactDate')
        .sort({ createdAt: -1 });

      res.json(customers);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // NEW: Get customer details for assistant
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

async function getProfitData() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return await Order.aggregate([
    { $match: { createdAt: { $gte: thirtyDaysAgo }, status: 'completed' } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        profit: { $sum: { $subtract: ["$totalAmount", "$costAmount"] } }
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

async function getNotifications(assistantId) {
  return await Task.find({ 
    assignedTo: assistantId, 
    status: 'pending',
    priority: 'high'
  })
  .sort({ createdAt: -1 })
  .limit(5)
  .select('title description createdAt');
}

// NEW: Get assistant-specific stats
async function getAssistantStats(assistantId, customerIds) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [totalCustomers, activeOrders, completedOrdersToday, pendingTasks] = await Promise.all([
      Customer.countDocuments({ assignedTo: assistantId }),
      Order.countDocuments({ 
        customerId: { $in: customerIds }, 
        status: { $in: ['pending', 'processing'] } 
      }),
      Order.countDocuments({ 
        customerId: { $in: customerIds }, 
        status: 'completed',
        createdAt: { $gte: today }
      }),
      Task.countDocuments({ 
        assignedTo: assistantId, 
        status: { $in: ['pending', 'in_progress'] } 
      })
    ]);

    return {
      totalCustomers,
      activeOrders,
      completedOrdersToday,
      pendingTasks
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