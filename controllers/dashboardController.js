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

  // Assistant Dashboard
  async getAssistantDashboard(req, res) {
    try {
      const assistantId = req.user.id;
      
      const [assignedTasks, recentOrders, notifications] = await Promise.all([
        Task.find({ assignedTo: assistantId, status: { $in: ['pending', 'in_progress'] } })
          .sort({ createdAt: -1 })
          .limit(10),
        Order.find({ assignedAssistant: assistantId })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('customer', 'name email'),
        getNotifications(assistantId)
      ]);

      res.json({
        assignedTasks,
        recentOrders,
        notifications
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },

  // Quick Stats
  async getQuickStats(req, res) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [todayOrders, activeCustomers, pendingPayments] = await Promise.all([
        Order.countDocuments({ createdAt: { $gte: today } }),
        Customer.countDocuments({ status: 'active' }),
        Payment.countDocuments({ status: 'pending' })
      ]);

      res.json({
        todayOrders,
        activeCustomers,
        pendingPayments
      });
    } catch (error) {
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
          .populate('customer', 'name')
          .select('orderNumber status createdAt customer totalAmount');
      } else {
        activities = await Order.find({ assignedAssistant: userId })
          .sort({ createdAt: -1 })
          .limit(20)
          .populate('customer', 'name')
          .select('orderNumber status createdAt customer totalAmount');
      }

      res.json(activities);
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

module.exports = dashboardController;