const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user._id, 
      email: user.email, 
      role: user.role 
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
};

// Helper function to create success response
const createSuccessResponse = (message, data = null, token = null) => {
  const response = { success: true, message };
  if (data) response.data = data;
  if (token) response.token = token;
  return response;
};

// Register new user (Admin self-registration)
const register = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, password, role = 'admin' } = req.body;

    // Check if user exists
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create new user
    user = new User({
      firstName,
      lastName,
      email,
      password,
      role
    });

    await user.save();

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: user.toJSON(),
      token,
      permissions: user.permissions || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Login user
const login = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, role } = req.body;

    // Validate role if provided
    if (role && !['admin', 'assistant'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is inactive' });
    }

    // Verify user's role matches the requested role (if role is specified)
    if (role && user.role !== role) {
      return res.status(403).json({ error: `Access denied. You don't have ${role} privileges` });
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    // Return response format that matches frontend expectations
    res.json({
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      token,
      permissions: user.permissions || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Verify token - NEW METHOD ADDED
const verifyToken = async (req, res) => {
  try {
    // The authMiddleware has already verified the token and attached user to req.user
    // So if we reach here, the token is valid
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        valid: false, 
        error: 'User not found' 
      });
    }

    // Check if user is still active
    if (!user.isActive) {
      return res.status(403).json({ 
        success: false, 
        valid: false, 
        error: 'Account is inactive' 
      });
    }

    res.json({
      success: true,
      valid: true,
      user: user.toJSON(),
      message: 'Token is valid'
    });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ 
      success: false, 
      valid: false, 
      error: error.message 
    });
  }
};

// Get current user
const getCurrentUser = async (req, res) => {
  try {
    res.json(createSuccessResponse('User retrieved successfully', { user: req.user }));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email } = req.body;
    const userId = req.user._id;

    // Check if email is already taken by another user
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }

    const updateData = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (email) updateData.email = email;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    // Return response format that matches frontend expectations
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Update password
    user.password = newPassword;
    user.mustChangePassword = false;
    await user.save();

    res.json(createSuccessResponse('Password changed successfully'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Logout (if you need token blacklisting)
const logout = async (req, res) => {
  try {
    // In a real app, you'd add the token to a blacklist
    res.json(createSuccessResponse('Logged out successfully'));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Refresh token
const refreshToken = async (req, res) => {
  try {
    const token = generateToken(req.user);
    res.json({
      success: true,
      message: 'Token refreshed successfully',
      token,
      user: req.user
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  verifyToken,  // NEW METHOD EXPORTED
  getCurrentUser,
  updateProfile,
  changePassword,
  logout,
  refreshToken
};