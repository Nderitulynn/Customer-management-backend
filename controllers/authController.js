const User = require('../models/User');
const Customer = require('../models/Customer');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
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

    const { email, password, role, portal } = req.body;

    // Validate role if provided - ENHANCED: Added customer role support
    if (role && !['admin', 'assistant', 'customer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role specified' });
    }

    // Find user by email
    const user = await User.findOne({ email }).populate('customerProfile');
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

    // ENHANCED: Portal-specific logic
    if (portal) {
      if (portal === 'customer' && user.role !== 'customer') {
        return res.status(403).json({ error: 'Access denied. Customer portal access required' });
      }
      if (portal === 'admin' && !['admin', 'assistant'].includes(user.role)) {
        return res.status(403).json({ error: 'Access denied. Admin portal access required' });
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    // ENHANCED: Return response format that matches frontend expectations with customer data
    const responseData = {
      success: true,
      message: 'Login successful',
      user: user.toJSON(),
      token,
      permissions: user.permissions || []
    };

    // Add customer data for customer users
    if (user.role === 'customer' && user.customerProfile) {
      responseData.customer = {
        id: user.customerProfile._id,
        fullName: user.customerProfile.fullName,
        email: user.customerProfile.email,
        phone: user.customerProfile.phone,
        hasAccess: user.customerProfile.hasAccess,
        isActive: user.customerProfile.isActive
      };
    }

    res.json(responseData);
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

// ==================== NEW CUSTOMER FEATURES ====================

// Customer Registration Method
const registerCustomer = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { firstName, lastName, email, password, phone, fullName } = req.body;

    // Check if user already exists
    let existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists' });
    }

    let customer = null;

    // Look for existing customer by email
    customer = await Customer.findOne({ email });

    // If no existing customer found, create new one
    if (!customer) {
      customer = new Customer({
        fullName: fullName || `${firstName} ${lastName}`,
        email,
        phone,
        hasAccess: true,
        isActive: true
      });
      await customer.save();
    }

    // Generate email verification token
    const emailVerificationToken = crypto.randomBytes(32).toString('hex');
    const emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user account (set as active since we can't send email verification)
    const user = new User({
      firstName: firstName || customer.fullName.split(' ')[0],
      lastName: lastName || customer.fullName.split(' ')[1] || '',
      email,
      password,
      role: 'customer',
      customerProfile: customer._id,
      isActive: true, // Set as active since email service is removed
      emailVerificationToken,
      emailVerificationExpires
    });

    await user.save();

    // Generate token for immediate login
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Customer account created successfully.',
      user: user.toJSON(),
      token,
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone
      }
    });
  } catch (error) {
    console.error('Customer registration error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Customer Account Linking
const linkCustomerAccount = async (req, res) => {
  try {
    const { email, verificationData } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Find customer by email
    const customer = await Customer.findOne({ email });
    if (!customer) {
      return res.status(400).json({ error: 'No customer record found with this email' });
    }

    // Additional verification if provided
    if (verificationData) {
      if (verificationData.phone && customer.phone !== verificationData.phone) {
        return res.status(400).json({ error: 'Phone number does not match customer record' });
      }
    }

    // Check if user already exists with this email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'A user account with this email already exists' });
    }

    res.json({
      success: true,
      message: 'Customer account verified. You can now proceed with account creation.',
      customer: {
        id: customer._id,
        fullName: customer.fullName,
        email: customer.email,
        phone: customer.phone
      }
    });
  } catch (error) {
    console.error('Customer account linking error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Email Verification (modified to work without email service)
const verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ error: 'Verification token is required' });
    }

    // Find user with this verification token
    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: new Date() },
      role: 'customer'
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired verification token' 
      });
    }

    // Activate the user account
    user.isActive = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    user.emailVerifiedAt = new Date();
    await user.save();

    // Update customer record
    if (user.customerProfile) {
      await Customer.findByIdAndUpdate(user.customerProfile, {
        emailVerified: true,
        emailVerifiedAt: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Email verified successfully. You can now login to your account.'
    });
  } catch (error) {
    console.error('Email verification error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Customer Password Reset Request (modified to work without email service)
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await User.findOne({ email, role: 'customer' });

    if (!user) {
      // Don't reveal if email exists or not for security
      return res.json({
        success: true,
        message: 'If an account with this email exists, you will receive password reset instructions.'
      });
    }

    // Generate password reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = resetTokenExpires;
    await user.save();

    // Since email service is removed, return the token in response (for development/testing)
    // In production, you would typically not return the token directly
    res.json({
      success: true,
      message: 'Password reset token generated successfully.',
      resetToken: resetToken // Remove this in production when email service is implemented
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Customer Password Reset
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    // Find user with valid reset token
    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: new Date() },
      role: 'customer'
    });

    if (!user) {
      return res.status(400).json({ 
        error: 'Invalid or expired password reset token' 
      });
    }

    // Update password
    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.mustChangePassword = false;
    user.passwordChangedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.'
    });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  verifyToken,
  getCurrentUser,
  updateProfile,
  changePassword,
  logout,
  refreshToken,
  // NEW CUSTOMER FEATURES
  registerCustomer,
  linkCustomerAccount,
  verifyEmail,
  requestPasswordReset,
  resetPassword
};