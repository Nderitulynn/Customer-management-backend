const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { generatePassword, sendEmail } = require('../utils/helpers');

class UserController {
  // Create new Assistant account
  async createAssistant(req, res) {
    try {
      const { name, email, phone, specializations } = req.body;
      
      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already exists' });
      }

      // Generate temporary password
      const tempPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(tempPassword, 12);

      const assistant = new User({
        name,
        email,
        phone,
        password: hashedPassword,
        role: 'assistant',
        specializations: specializations || [],
        isActive: true,
        createdBy: req.user.id
      });

      await assistant.save();

      // Send credentials email
      await sendEmail(email, 'Account Created', 
        `Your account has been created. Password: ${tempPassword}`);

      res.status(201).json({
        message: 'Assistant created successfully',
        assistant: { id: assistant._id, name, email, role: assistant.role }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update Assistant profile
  async updateAssistant(req, res) {
    try {
      const { id } = req.params;
      const { name, phone, specializations, customers } = req.body;

      const assistant = await User.findByIdAndUpdate(
        id,
        { name, phone, specializations, customers },
        { new: true, select: '-password' }
      );

      if (!assistant) {
        return res.status(404).json({ error: 'Assistant not found' });
      }

      res.json({ message: 'Assistant updated', assistant });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Toggle Assistant account status
  async toggleAssistantStatus(req, res) {
    try {
      const { id } = req.params;
      
      const assistant = await User.findById(id);
      if (!assistant || assistant.role !== 'assistant') {
        return res.status(404).json({ error: 'Assistant not found' });
      }

      assistant.isActive = !assistant.isActive;
      await assistant.save();

      res.json({ 
        message: `Assistant ${assistant.isActive ? 'activated' : 'deactivated'}`,
        isActive: assistant.isActive 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get Assistant performance metrics
  async getAssistantMetrics(req, res) {
    try {
      const { id } = req.params;
      
      const assistant = await User.findById(id)
        .populate('customers', 'name email')
        .select('-password');

      if (!assistant) {
        return res.status(404).json({ error: 'Assistant not found' });
      }

      // Calculate metrics
      const totalCustomers = assistant.customers.length;
      const activeCustomers = await Customer.countDocuments({
        assignedTo: id,
        isActive: true
      });

      // Mock performance data (replace with actual metrics)
      const metrics = {
        assistant: {
          name: assistant.name,
          email: assistant.email,
          isActive: assistant.isActive
        },
        workload: {
          totalCustomers,
          activeCustomers,
          specializations: assistant.specializations
        },
        performance: {
          responseTime: '2.3 hours avg',
          satisfactionRate: '94%',
          ticketsResolved: 156
        }
      };

      res.json(metrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Reset Assistant password
  async resetPassword(req, res) {
    try {
      const { id } = req.params;
      
      const assistant = await User.findById(id);
      if (!assistant || assistant.role !== 'assistant') {
        return res.status(404).json({ error: 'Assistant not found' });
      }

      const newPassword = generatePassword();
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      assistant.password = hashedPassword;
      assistant.mustChangePassword = true;
      await assistant.save();

      await sendEmail(assistant.email, 'Password Reset', 
        `Your new password: ${newPassword}. Please change it after login.`);

      res.json({ message: 'Password reset successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Bulk customer assignment
  async bulkAssignCustomers(req, res) {
    try {
      const { assistantId, customerIds, action } = req.body;

      if (action === 'assign') {
        await User.findByIdAndUpdate(assistantId, {
          $addToSet: { customers: { $each: customerIds } }
        });
        
        await Customer.updateMany(
          { _id: { $in: customerIds } },
          { assignedTo: assistantId }
        );
      } else if (action === 'unassign') {
        await User.findByIdAndUpdate(assistantId, {
          $pullAll: { customers: customerIds }
        });
        
        await Customer.updateMany(
          { _id: { $in: customerIds } },
          { $unset: { assignedTo: 1 } }
        );
      }

      res.json({ 
        message: `${customerIds.length} customers ${action}ed successfully` 
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get all Assistants with workload
  async getAllAssistants(req, res) {
    try {
      const assistants = await User.find({ role: 'assistant' })
        .populate('customers', 'name email')
        .select('-password')
        .sort({ createdAt: -1 });

      const assistantsWithMetrics = assistants.map(assistant => ({
        id: assistant._id,
        name: assistant.name,
        email: assistant.email,
        isActive: assistant.isActive,
        customerCount: assistant.customers.length,
        specializations: assistant.specializations,
        lastLogin: assistant.lastLogin
      }));

      res.json(assistantsWithMetrics);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Reassign customers between assistants
  async reassignCustomers(req, res) {
    try {
      const { fromAssistantId, toAssistantId, customerIds } = req.body;

      // Remove from old assistant
      await User.findByIdAndUpdate(fromAssistantId, {
        $pullAll: { customers: customerIds }
      });

      // Add to new assistant
      await User.findByIdAndUpdate(toAssistantId, {
        $addToSet: { customers: { $each: customerIds } }
      });

      // Update customer records
      await Customer.updateMany(
        { _id: { $in: customerIds } },
        { assignedTo: toAssistantId }
      );

      res.json({ message: 'Customers reassigned successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new UserController();