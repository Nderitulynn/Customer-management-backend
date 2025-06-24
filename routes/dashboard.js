const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const cache = require('../middleware/cache');

// Dashboard data by role
router.get('/data', auth, cache(300), async (req, res) => {
  try {
    const { role } = req.user;
    
    if (role === 'admin') {
      const data = {
        stats: {
          totalUsers: 150,
          activeUsers: 89,
          totalOrders: 245,
          revenue: 15420
        },
        recentActivity: [
          { id: 1, type: 'user_signup', message: 'New user registered', time: '2 mins ago' },
          { id: 2, type: 'order_placed', message: 'Order #1234 placed', time: '5 mins ago' }
        ],
        quickActions: [
          { id: 'manage_users', label: 'Manage Users', url: '/admin/users' },
          { id: 'view_reports', label: 'View Reports', url: '/admin/reports' }
        ]
      };
      res.json(data);
    } else {
      const data = {
        stats: {
          myTasks: 12,
          completed: 8,
          pending: 4,
          overdue: 1
        },
        recentActivity: [
          { id: 1, type: 'task_completed', message: 'Task completed successfully', time: '1 hour ago' },
          { id: 2, type: 'task_assigned', message: 'New task assigned', time: '3 hours ago' }
        ],
        quickActions: [
          { id: 'new_task', label: 'Create Task', url: '/tasks/new' },
          { id: 'view_schedule', label: 'View Schedule', url: '/schedule' }
        ]
      };
      res.json(data);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Real-time statistics
router.get('/stats', auth, cache(60), async (req, res) => {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      activeUsers: Math.floor(Math.random() * 100) + 50,
      systemLoad: Math.floor(Math.random() * 100),
      responseTime: Math.floor(Math.random() * 200) + 50
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// Activity feed
router.get('/activity', auth, cache(120), async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const activities = [
      { id: 1, user: 'John Doe', action: 'logged in', timestamp: new Date() },
      { id: 2, user: 'Jane Smith', action: 'updated profile', timestamp: new Date(Date.now() - 300000) },
      { id: 3, user: 'Bob Johnson', action: 'placed order', timestamp: new Date(Date.now() - 600000) }
    ].slice(0, parseInt(limit));
    
    res.json(activities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch activity feed' });
  }
});

// Quick actions
router.post('/quick-action/:actionId', auth, async (req, res) => {
  try {
    const { actionId } = req.params;
    const { data } = req.body;
    
    // Mock quick action processing
    const result = {
      actionId,
      success: true,
      message: `Action ${actionId} executed successfully`,
      timestamp: new Date().toISOString()
    };
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Failed to execute quick action' });
  }
});

module.exports = router;