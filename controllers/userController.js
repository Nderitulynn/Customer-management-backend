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

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
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
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const assistant = new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
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
      .populate('customers', 'name email')
      .select('-password')
      .sort({ createdAt: -1 });

    const assistantsWithMetrics = assistants.map(assistant => ({
      id: assistant._id,
      firstName: assistant.firstName,
      lastName: assistant.lastName,
      email: assistant.email,
      isActive: assistant.isActive,
      customerCount: assistant.customers ? assistant.customers.length : 0,
      lastLogin: assistant.lastLogin,
      mustChangePassword: assistant.mustChangePassword
    }));

    res.json(assistantsWithMetrics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getAssistantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id)
      .populate('customers', 'name email')
      .select('-password');

    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    res.json(assistant);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateAssistant = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, customers } = req.body;

    const assistant = await User.findByIdAndUpdate(
      id,
      { firstName, lastName, customers },
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
};

// ===== ASSISTANT SELF-SERVICE METHODS =====
const getMyProfile = async (req, res) => {
  try {
    const assistant = await User.findById(req.user.id)
      .populate('customers', 'name email')
      .select('-password');

    if (!assistant) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json(assistant);
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

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    
    // Update password and reset flag
    user.password = hashedNewPassword;
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
      .populate('customers', 'name email')
      .select('-password');

    if (!assistant) {
      return res.status(404).json({ error: 'Assistant not found' });
    }

    // Calculate metrics
    const totalCustomers = assistant.customers ? assistant.customers.length : 0;
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
};

const reassignCustomers = async (req, res) => {
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
};

// ===== EXPORTS =====
module.exports = {
  registerAdmin,
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