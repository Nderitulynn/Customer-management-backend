const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Customer = require('../models/Customer');

// Generate simple random password
const generateSimplePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$';
  let password = '';
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// ===== ADMIN REGISTRATION (One-time setup) =====
const registerAdmin = async (req, res) => {
  try {
    const { firstName, lastName, email, password } = req.body;
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ role: 'admin' });
    if (existingAdmin) {
      return res.status(400).json({ 
        success: false, 
        message: 'Admin account already exists' 
      });
    }

    // Check if email exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }

    const admin = new User({
      firstName,
      lastName,
      email,
      password,
      role: 'admin',
      isActive: true
    });

    await admin.save();

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      data: { 
        id: admin._id, 
        firstName, 
        lastName, 
        email, 
        role: admin.role 
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== GET ALL USERS =====
const getAllUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Users retrieved successfully',
      data: users
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== CREATE ASSISTANT =====
const createAssistant = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already exists' 
      });
    }

    // Generate temporary password
    const tempPassword = generateSimplePassword();

    const assistant = new User({
      firstName,
      lastName,
      email,
      password: tempPassword,
      role: 'assistant',
      isActive: true,
      mustChangePassword: true,
      createdBy: req.user.id
    });

    await assistant.save();

    res.status(201).json({
      success: true,
      message: 'Assistant created successfully',
      data: { 
        id: assistant._id, 
        firstName, 
        lastName, 
        email, 
        role: assistant.role,
        tempPassword: tempPassword // Show password to admin
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== GET ALL ASSISTANTS =====
const getAllAssistants = async (req, res) => {
  try {
    const assistants = await User.find({ role: 'assistant' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      message: 'Assistants retrieved successfully',
      data: assistants
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== GET ASSISTANT DETAILS =====
const getAssistantDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id).select('-password');
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ 
        success: false, 
        message: 'Assistant not found' 
      });
    }

    // Get assigned customers
    const assignedCustomers = await Customer.find({ assignedTo: id })
      .select('firstName lastName email isActive');

    res.json({
      success: true,
      message: 'Assistant details retrieved successfully',
      data: {
        ...assistant.toObject(),
        customers: assignedCustomers
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== UPDATE ASSISTANT =====
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
      return res.status(404).json({ 
        success: false, 
        message: 'Assistant not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Assistant updated successfully', 
      data: assistant 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== DELETE ASSISTANT =====
const deleteAssistant = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id);
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ 
        success: false, 
        message: 'Assistant not found' 
      });
    }

    // Unassign all customers before deleting
    await Customer.updateMany(
      { assignedTo: id },
      { $unset: { assignedTo: 1 } }
    );

    await User.findByIdAndDelete(id);

    res.json({ 
      success: true, 
      message: 'Assistant deleted successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== TOGGLE ASSISTANT STATUS =====
const toggleAssistantStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id);
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ 
        success: false, 
        message: 'Assistant not found' 
      });
    }

    assistant.isActive = !assistant.isActive;
    await assistant.save();

    res.json({ 
      success: true,
      message: `Assistant ${assistant.isActive ? 'activated' : 'deactivated'} successfully`,
      data: { isActive: assistant.isActive }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== RESET PASSWORD =====
const resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    
    const assistant = await User.findById(id);
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ 
        success: false, 
        message: 'Assistant not found' 
      });
    }

    // Generate new password
    const newPassword = generateSimplePassword();

    assistant.password = newPassword;
    assistant.mustChangePassword = true;
    await assistant.save();

    res.json({ 
      success: true,
      message: 'Password reset successfully',
      data: {
        email: assistant.email,
        newPassword: newPassword // Show new password to admin
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== ASSISTANT SELF-SERVICE =====
const getMyProfile = async (req, res) => {
  try {
    const assistant = await User.findById(req.user.id).select('-password');
    if (!assistant) {
      return res.status(404).json({ 
        success: false, 
        message: 'Profile not found' 
      });
    }

    // Get assigned customers
    const assignedCustomers = await Customer.find({ assignedTo: req.user.id })
      .select('firstName lastName email isActive');

    res.json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        ...assistant.toObject(),
        customers: assignedCustomers
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
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
      return res.status(404).json({ 
        success: false, 
        message: 'Profile not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Profile updated successfully', 
      data: assistant 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const changeMyPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    
    // Basic password validation
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 6 characters long' 
      });
    }
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ 
        success: false, 
        message: 'Current password is incorrect' 
      });
    }

    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res.json({ 
      success: true, 
      message: 'Password changed successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// ===== CUSTOMER ASSIGNMENT =====
const assignCustomer = async (req, res) => {
  try {
    const { customerId, assistantId } = req.body;

    // Validate assistant exists and is active
    const assistant = await User.findById(assistantId);
    if (!assistant || assistant.role !== 'assistant') {
      return res.status(404).json({ 
        success: false, 
        message: 'Assistant not found' 
      });
    }
    
    if (!assistant.isActive) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot assign customer to inactive assistant' 
      });
    }

    // Update customer assignment
    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { assignedTo: assistantId },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Customer assigned successfully',
      data: customer
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

const unassignCustomer = async (req, res) => {
  try {
    const { customerId } = req.body;

    const customer = await Customer.findByIdAndUpdate(
      customerId,
      { $unset: { assignedTo: 1 } },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({ 
        success: false, 
        message: 'Customer not found' 
      });
    }

    res.json({ 
      success: true, 
      message: 'Customer unassigned successfully',
      data: customer
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
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
  assignCustomer,
  unassignCustomer
};