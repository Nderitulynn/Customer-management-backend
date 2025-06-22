// backend/controllers/authController.js
const User = require('../models/User');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { validationResult } = require('express-validator');

// Helper function to generate JWT tokens
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' }
  );

  return { accessToken, refreshToken };
};

// Helper function to create success response
const createSuccessResponse = (message, data = null, token = null) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString()
  };

  if (data) response.data = data;
  if (token) response.token = token;

  return response;
};

// Helper function to create error response
const createErrorResponse = (message, errors = null) => {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };

  if (errors) response.errors = errors;

  return response;
};

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        createErrorResponse('Validation failed', errors.array())
      );
    }

    const { username, email, password, firstName, lastName, role = 'assistant' } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'email' : 'username';
      return res.status(409).json(
        createErrorResponse(`User with this ${field} already exists`)
      );
    }

    // Validate role
    if (!['admin', 'assistant'].includes(role)) {
      return res.status(400).json(
        createErrorResponse('Invalid role. Must be admin or assistant')
      );
    }

    // Create new user
    const user = new User({
      username,
      email,
      password,
      firstName,
      lastName,
      role
    });

    await user.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Update user with refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Remove sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(201).json(
      createSuccessResponse(
        'User registered successfully',
        { user: userResponse },
        { accessToken, refreshToken }
      )
    );

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json(
        createErrorResponse('Validation failed', validationErrors)
      );
    }

    res.status(500).json(
      createErrorResponse('Internal server error during registration')
    );
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        createErrorResponse('Validation failed', errors.array())
      );
    }

    const { login, password } = req.body;

    // Find user by username or email
    const user = await User.findOne({
      $or: [{ email: login }, { username: login }]
    }).select('+password');

    if (!user) {
      return res.status(401).json(
        createErrorResponse('Invalid credentials')
      );
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json(
        createErrorResponse('Invalid credentials')
      );
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);

    // Update user with refresh token and last login
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    // Remove sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(200).json(
      createSuccessResponse(
        'Login successful',
        { user: userResponse },
        { accessToken, refreshToken }
      )
    );

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error during login')
    );
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json(
        createErrorResponse('User not found')
      );
    }

    // Remove sensitive data from response
    const userResponse = user.toJSON();
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(200).json(
      createSuccessResponse(
        'Profile retrieved successfully',
        { user: userResponse }
      )
    );

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error while fetching profile')
    );
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        createErrorResponse('Validation failed', errors.array())
      );
    }

    const { firstName, lastName, email } = req.body;
    const userId = req.user.userId;

    // Check if email is being changed and if it's already taken
    if (email) {
      const existingUser = await User.findOne({
        email,
        _id: { $ne: userId }
      });

      if (existingUser) {
        return res.status(409).json(
          createErrorResponse('Email already in use')
        );
      }
    }

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, email },
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json(
        createErrorResponse('User not found')
      );
    }

    // Remove sensitive data from response
    const userResponse = updatedUser.toJSON();
    delete userResponse.password;
    delete userResponse.refreshToken;

    res.status(200).json(
      createSuccessResponse(
        'Profile updated successfully',
        { user: userResponse }
      )
    );

  } catch (error) {
    console.error('Update profile error:', error);
    
    // Handle mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => ({
        field: err.path,
        message: err.message
      }));
      return res.status(400).json(
        createErrorResponse('Validation failed', validationErrors)
      );
    }

    res.status(500).json(
      createErrorResponse('Internal server error while updating profile')
    );
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json(
        createErrorResponse('Validation failed', errors.array())
      );
    }

    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    // Find user with password
    const user = await User.findById(userId).select('+password');
    if (!user) {
      return res.status(404).json(
        createErrorResponse('User not found')
      );
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(401).json(
        createErrorResponse('Current password is incorrect')
      );
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json(
      createSuccessResponse('Password changed successfully')
    );

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error while changing password')
    );
  }
};

// @desc    Refresh access token
// @route   POST /api/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json(
        createErrorResponse('Refresh token is required')
      );
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json(
        createErrorResponse('Invalid refresh token')
      );
    }

    // Find user with matching refresh token
    const user = await User.findOne({
      _id: decoded.userId,
      refreshToken
    });

    if (!user) {
      return res.status(401).json(
        createErrorResponse('Invalid refresh token')
      );
    }

    // Generate new tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);

    // Update user with new refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json(
      createSuccessResponse(
        'Token refreshed successfully',
        null,
        { accessToken, refreshToken: newRefreshToken }
      )
    );

  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error while refreshing token')
    );
  }
};

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    const userId = req.user.userId;

    // Clear refresh token from database
    await User.findByIdAndUpdate(userId, {
      refreshToken: null
    });

    res.status(200).json(
      createSuccessResponse('Logout successful')
    );

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error during logout')
    );
  }
};

// @desc    Get all users (Admin only)
// @route   GET /api/auth/users
// @access  Private (Admin)
const getAllUsers = async (req, res) => {
  try {
    const { page = 1, limit = 10, role, search } = req.query;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } }
      ];
    }

    // Get users with pagination
    const users = await User.find(filter)
      .select('-password -refreshToken')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalUsers = await User.countDocuments(filter);
    const totalPages = Math.ceil(totalUsers / limit);

    res.status(200).json(
      createSuccessResponse(
        'Users retrieved successfully',
        {
          users,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalUsers,
            hasNext: page < totalPages,
            hasPrev: page > 1
          }
        }
      )
    );

  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error while fetching users')
    );
  }
};

module.exports = {
  register,
  login,
  getProfile,
  updateProfile,
  changePassword,
  refreshToken,
  logout,
  getAllUsers
};