const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Customer = require('../models/Customer');
const { generatePassword, sendEmail } = require('../utils/helpers');

// ===== ADMIN REGISTRATION (One-time setup) =====
const registerAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ error: 'Admin account already exists' });
    }

    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // FIXED: Remove manual hashing - let User model handle it
    const admin = new User({
      firstName,
      lastName,
      email,
      password, // Plain text password - User model will hash it
      role: 'admin',
      isActive: true
    });

    await admin.save();

    res.status(201).json({
      message: 'Admin account created successfully',
      admin: { 
        id: admin._id, 
        firstName, 
        lastName, 
        email, 
        role: admin.role 
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== GET ALL USERS (Admin Only) =====
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    // Separate users by role for easier frontend consumption
    const usersByRole = {
      admins: users.filter(user => user.role === 'admin'),
      assistants: users.filter(user => user.role === 'assistant')
    };

    res.json({
      success: true,
      data: {
        users: users,
        usersByRole: usersByRole,
        totalUsers: users.length,
        totalAdmins: usersByRole.admins.length,
        totalAssistants: usersByRole.assistants.length
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

// ===== ASSISTANT CREATION & MANAGEMENT (Admin Only) =====
const createAssistant = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    // Generate temporary password
    const tempPassword = generatePassword();
    // FIXED: Remove manual hashing - let User model handle it

    const assistant = new User({
      firstName,
      lastName,
      email,
      password: tempPassword, // Plain text password - User model will hash it
      role: 'assistant',
      isActive: true,
      mustChangePassword: true,
      createdBy: req.user.id
    });

    await assistant.save();

    // Send credentials email
    await sendEmail(email, 'Account Created', 
      `Your account has been created. Password: ${tempPassword}. Please change your password after first login.`);

    res.status(201).json({
      message: 'Assistant created successfully',
      assistant: { 
        id: assistant._id, 
        firstName, 
        lastName, 
        email, 
        role: assistant.role 
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAllAssistants = async (req, res) => {
  try {
    const assistants = await User.find({ role: 'assistant' })
      .select('-password')
      .sort({ createdAt: -1 });

    // FIXED: Calculate customer count via Customer queries instead of user.customers
    const assistantsWithMetrics = await Promise.all(
      assistants.map(async (assistant) => {
        const customerCount = await Customer.countDocuments({ assignedTo: assistant._id });
        
        return {
          id: assistant._id,
          firstName: assistant.firstName,
          lastName: assistant.lastName,
          email: assistant.email,
          isActive: assistant.isActive,
          customerCount: customerCount,
          lastLogin: assistant.lastLogin,
          mustChangePassword: assistant.mustChangePassword
        };
      })
    );

    res.json(assistantsWithMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAssistantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id)
      .select('-password');

    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // FIXED: Get assigned customers via Customer query instead of populate
    const assignedCustomers = await Customer.find({ assignedTo: id })
      .select('name email isActive');

    const assistantWithCustomers = {
      ...assistant.toObject(),
      customers: assignedCustomers
    };

    res.json(assistantWithCustomers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateAssistant = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName } = req.body;

    const assistant = await User.findByIdAndUpdate(
      id,
      { firstName, lastName },
      { new: true, select: '-password' }
    );

    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    res.json({ message: 'Assistant updated successfully', assistant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const deleteAssistant = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id);
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // Unassign all customers before deleting
    await Customer.updateMany(
      { assignedTo: id },
      { $unset: { assignedTo: 1 } }
    );

    await User.findByIdAndDelete(id);

    res.json({ message: 'Assistant deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== ASSISTANT ACCOUNT STATUS MANAGEMENT =====
const toggleAssistantStatus = async (req, res) => {
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
};

const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id);
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    const newPassword = generatePassword();
    // FIXED: Remove manual hashing - let User model handle it

    assistant.password = newPassword; // Plain text password - User model will hash it
    assistant.mustChangePassword = true;
    await assistant.save();

    await sendEmail(assistant.email, 'Password Reset', 
      `Your new password: ${newPassword}. Please change it after login.`);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== ASSISTANT SELF-SERVICE METHODS =====
const getMyProfile = async (req, res) => {
  try {
    const assistant = await User.findById(req.user.id)
      .select('-password');

    if (!assistant) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    // FIXED: Get assigned customers via Customer query instead of populate
    const assignedCustomers = await Customer.find({ assignedTo: req.user.id })
      .select('name email isActive');

    const profileWithCustomers = {
      ...assistant.toObject(),
      customers: assignedCustomers
    };

    res.json(profileWithCustomers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateMyProfile = async (req, res) => {
  try {
    const { firstName, lastName } = req.body;
    
    const assistant = await User.findByIdAndUpdate(
      req.user.id,
      { firstName, lastName },
      { new: true, select: '-password' }
    );

    if (!assistant) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ message: 'Profile updated successfully', assistant });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // FIXED: Remove manual hashing - let User model handle it
    user.password = newPassword; // Plain text password - User model will hash it
    user.mustChangePassword = false;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== PERFORMANCE & ANALYTICS =====
const getAssistantPerformance = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id)
      .select('-password');

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // FIXED: Calculate metrics via Customer queries instead of user.customers
    const totalCustomers = await Customer.countDocuments({ assignedTo: id });
    const activeCustomers = await Customer.countDocuments({
      assignedTo: id,
      isActive: true
    });

    // Mock performance data (replace with actual metrics)
    const metrics = {
      assistant: {
        firstName: assistant.firstName,
        lastName: assistant.lastName,
        email: assistant.email,
        isActive: assistant.isActive
      },
      workload: {
        totalCustomers,
        activeCustomers
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
};

// ===== BULK OPERATIONS =====
const bulkAssignCustomers = async (req, res) => {
  try {
    const { assistantId, customerIds, action } = req.body;

    // FIXED: Remove User.findByIdAndUpdate operations on non-existent customers array
    if (action === 'assign') {
      await Customer.updateMany(
        { _id: { $in: customerIds } },
        { assignedTo: assistantId }
      );
    } else if (action === 'unassign') {
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
};

const reassignCustomers = async (req, res) => {
  try {
    const { fromAssistantId, toAssistantId, customerIds } = req.body;

    // FIXED: Remove User.findByIdAndUpdate operations on non-existent customers array
    // Simply update customer records with new assignment
    await Customer.updateMany(
      { _id: { $in: customerIds } },
      { assignedTo: toAssistantId }
    );

    res.json({ message: 'Customers reassigned successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ===== EXPORTS =====
module.exports = {
  registerAdmin,
  getAllUsers,
  createAssistant,
  getAllAssistants,
  getAssistantDetails,
  updateAssistant,
  deleteAssistant,
  toggleAssistantStatus,
  resetPassword,
  getMyProfile,
  updateMyProfile,
  changeMyPassword,
  getAssistantPerformance,
  bulkAssignCustomers,
  reassignCustomers
};