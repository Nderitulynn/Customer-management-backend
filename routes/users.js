const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate, authorize } = require('../middleware/auth');
const { validateAssistant, validateBulkOperation } = require('../middleware/validation');

// Apply authentication to all routes
router.use(authenticate);

// ===== ASSISTANT CRUD OPERATIONS (Admin Only) =====

// Create new Assistant account
router.post('/assistants', 
  authorize(['admin']), 
  validateAssistant,
  userController.createAssistant
);

// Get all Assistants with workload summary
router.get('/assistants', 
  authorize(['admin']), 
  userController.getAllAssistants
);

// Get specific Assistant details and metrics
router.get('/assistants/:id', 
  authorize(['admin']), 
  userController.getAssistantMetrics
);

// Update Assistant profile and settings
router.put('/assistants/:id', 
  authorize(['admin']), 
  userController.updateAssistant
);

// Delete Assistant account (soft delete)
router.delete('/assistants/:id', 
  authorize(['admin']), 
  userController.toggleAssistantStatus
);

// ===== ACCOUNT STATUS MANAGEMENT =====

// Toggle Assistant active/inactive status
router.patch('/assistants/:id/toggle-status', 
  authorize(['admin']), 
  userController.toggleAssistantStatus
);

// Reset Assistant password
router.post('/assistants/:id/reset-password', 
  authorize(['admin']), 
  userController.resetPassword
);

// ===== CUSTOMER ASSIGNMENT ENDPOINTS =====

// Assign customers to Assistant
router.post('/assistants/:id/assign-customers', 
  authorize(['admin']), 
  validateBulkOperation,
  (req, res) => {
    req.body.assistantId = req.params.id;
    req.body.action = 'assign';
    userController.bulkAssignCustomers(req, res);
  }
);

// Remove customers from Assistant
router.post('/assistants/:id/unassign-customers', 
  authorize(['admin']), 
  validateBulkOperation,
  (req, res) => {
    req.body.assistantId = req.params.id;
    req.body.action = 'unassign';
    userController.bulkAssignCustomers(req, res);
  }
);

// Reassign customers between Assistants
router.post('/reassign-customers', 
  authorize(['admin']), 
  validateBulkOperation,
  userController.reassignCustomers
);

// ===== PERFORMANCE & ANALYTICS ENDPOINTS =====

// Get Assistant performance metrics
router.get('/assistants/:id/performance', 
  authorize(['admin']), 
  userController.getAssistantMetrics
);

// Get workload distribution across all Assistants
router.get('/workload-distribution', 
  authorize(['admin']), 
  async (req, res) => {
    try {
      const User = require('../models/User');
      
      const workloadData = await User.aggregate([
        { $match: { role: 'assistant' } },
        {
          $project: {
            name: 1,
            email: 1,
            isActive: 1,
            customerCount: { $size: { $ifNull: ['$customers', []] } }
          }
        },
        { $sort: { customerCount: -1 } }
      ]);

      const totalCustomers = workloadData.reduce((sum, assistant) => 
        sum + assistant.customerCount, 0
      );

      res.json({
        totalAssistants: workloadData.length,
        totalCustomers,
        averageWorkload: Math.round(totalCustomers / workloadData.length || 0),
        assistants: workloadData
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ===== BULK OPERATIONS =====

// Bulk update Assistant specializations
router.post('/bulk-update-specializations', 
  authorize(['admin']), 
  async (req, res) => {
    try {
      const { assistantIds, specializations, action } = req.body;
      
      const updateOperation = action === 'add' 
        ? { $addToSet: { specializations: { $each: specializations } } }
        : { $pullAll: { specializations } };

      await User.updateMany(
        { _id: { $in: assistantIds }, role: 'assistant' },
        updateOperation
      );

      res.json({ 
        message: `Specializations ${action}ed for ${assistantIds.length} assistants` 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Bulk activate/deactivate Assistants
router.post('/bulk-toggle-status', 
  authorize(['admin']), 
  async (req, res) => {
    try {
      const { assistantIds, isActive } = req.body;
      const User = require('../models/User');

      await User.updateMany(
        { _id: { $in: assistantIds }, role: 'assistant' },
        { isActive }
      );

      res.json({ 
        message: `${assistantIds.length} assistants ${isActive ? 'activated' : 'deactivated'}` 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// Auto-balance customer workload
router.post('/auto-balance-workload', 
  authorize(['admin']), 
  async (req, res) => {
    try {
      const User = require('../models/User');
      const Customer = require('../models/Customer');

      // Get active assistants with current workload
      const assistants = await User.find({ 
        role: 'assistant', 
        isActive: true 
      }).populate('customers');

      if (assistants.length === 0) {
        return res.status(400).json({ error: 'No active assistants found' });
      }

      // Get unassigned customers
      const unassignedCustomers = await Customer.find({ 
        assignedTo: { $exists: false } 
      });

      // Simple round-robin assignment
      for (let i = 0; i < unassignedCustomers.length; i++) {
        const assistant = assistants[i % assistants.length];
        
        await Customer.findByIdAndUpdate(
          unassignedCustomers[i]._id, 
          { assignedTo: assistant._id }
        );
        
        await User.findByIdAndUpdate(
          assistant._id,
          { $addToSet: { customers: unassignedCustomers[i]._id } }
        );
      }

      res.json({ 
        message: `${unassignedCustomers.length} customers auto-assigned`,
        distribution: assistants.map(a => ({
          name: a.name,
          newCustomers: Math.ceil(unassignedCustomers.length / assistants.length)
        }))
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

// ===== REPORTING ENDPOINTS =====

// Generate user management report
router.get('/management-report', 
  authorize(['admin']), 
  async (req, res) => {
    try {
      const User = require('../models/User');
      const Customer = require('../models/Customer');

      const [assistantStats, customerStats] = await Promise.all([
        User.aggregate([
          { $match: { role: 'assistant' } },
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              active: { $sum: { $cond: ['$isActive', 1, 0] } },
              inactive: { $sum: { $cond: ['$isActive', 0, 1] } }
            }
          }
        ]),
        Customer.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: 1 },
              assigned: { $sum: { $cond: [{ $ne: ['$assignedTo', null] }, 1, 0] } },
              unassigned: { $sum: { $cond: [{ $eq: ['$assignedTo', null] }, 1, 0] } }
            }
          }
        ])
      ]);

      const report = {
        assistants: assistantStats[0] || { total: 0, active: 0, inactive: 0 },
        customers: customerStats[0] || { total: 0, assigned: 0, unassigned: 0 },
        efficiency: {
          assignmentRate: customerStats[0] ? 
            Math.round((customerStats[0].assigned / customerStats[0].total) * 100) : 0,
          avgCustomersPerAssistant: assistantStats[0] && customerStats[0] ? 
            Math.round(customerStats[0].assigned / assistantStats[0].active) : 0
        },
        generatedAt: new Date().toISOString()
      };
add .

      res.json(report);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
);

module.exports = router;