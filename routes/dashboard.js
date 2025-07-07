const express = require('express');
const router = express.Router();
const { authenticate, authorize, requireAuth, requireAdmin, requireAssistant } = require('../middleware/auth');
const dashboardController = require('../controllers/dashboardController');

router.get('/admin', requireAdmin(), dashboardController.getAdminDashboard);

router.get('/assistant', requireAssistant(), dashboardController.getAssistantDashboard);

router.get('/assistant/customers', requireAssistant(), dashboardController.getAssignedCustomers);

router.get('/customer/:id', requireAuth(), dashboardController.getCustomerDetails);

router.get('/quick-stats', requireAuth(), dashboardController.getQuickStats);

router.get('/activity', requireAuth(), dashboardController.getRecentActivity);
router.get('/data', requireAuth(), async (req, res) => {
  try {
    const { role } = req.user;
    
    if (role === 'admin') {
      return dashboardController.getAdminDashboard(req, res);
    } else {
      return dashboardController.getAssistantDashboard(req, res);
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});
router.get('/stats/system', requireAdmin(), async (req, res) => {
  try {
    const stats = {
      timestamp: new Date().toISOString(),
      activeUsers: await getActiveUsersCount(),
      systemLoad: await getSystemLoad(),
      responseTime: await getAverageResponseTime()
    };
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch system statistics' });
  }
});
router.post('/quick-action/:actionId', requireAuth(), async (req, res) => {
  try {
    const { actionId } = req.params;
    const { data } = req.body;
    const userRole = req.user.role;
    
    const allowedActions = {
      admin: ['manage_users', 'view_reports', 'system_settings', 'backup_data'],
      assistant: ['create_task', 'update_customer', 'send_message', 'schedule_call']
    };
    
    if (!allowedActions[userRole]?.includes(actionId)) {
      return res.status(403).json({ error: 'Action not allowed for your role' });
    }
    
    const result = await processQuickAction(actionId, data, req.user);
    
    res.json({
      actionId,
      success: true,
      message: `Action ${actionId} executed successfully`,
      result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to execute quick action',
      details: error.message 
    });
  }
});
async function getActiveUsersCount() {
  try {
    const User = require('../models/User');
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    return await User.countDocuments({ 
      lastLogin: { $gte: fiveMinutesAgo },
      isActive: true 
    });
  } catch (error) {
    return 0;
  }
}

async function getSystemLoad() {
  return Math.floor(Math.random() * 100);
}

async function getAverageResponseTime() {
  return Math.floor(Math.random() * 200) + 50;
}
async function processQuickAction(actionId, data, user) {
  const Customer = require('../models/Customer');
  const Task = require('../models/Task');
  const Order = require('../models/Order');
  
  try {
    switch (actionId) {
      case 'create_task':
        return await Task.create({
          title: data.title,
          description: data.description,
          assignedTo: user.id,
          priority: data.priority || 'medium',
          status: 'pending'
        });
        
      case 'update_customer':
        const customer = await Customer.findOne({
          _id: data.customerId,
          assignedTo: user.id
        });
        if (!customer) {
          throw new Error('Customer not found or not assigned to you');
        }
        return await Customer.findByIdAndUpdate(
          data.customerId,
          { $set: data.updates },
          { new: true }
        );
        
      case 'send_message':
        return {
          messageId: 'msg_' + Date.now(),
          status: 'sent',
          recipient: data.recipient,
          message: data.message
        };
        
      case 'schedule_call':
        return {
          callId: 'call_' + Date.now(),
          scheduledFor: data.scheduledFor,
          customer: data.customerId,
          status: 'scheduled'
        };
        
      case 'manage_users':
        if (user.role !== 'admin') {
          throw new Error('Unauthorized');
        }
        return { action: 'User management interface accessed' };
        
      case 'view_reports':
        if (user.role !== 'admin') {
          throw new Error('Unauthorized');
        }
        return { action: 'Reports interface accessed' };
        
      default:
        throw new Error('Unknown action');
    }
  } catch (error) {
    throw new Error(`Failed to process action: ${error.message}`);
  }
}
router.use((error, req, res, next) => {
  console.error('Dashboard route error:', error);
  
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