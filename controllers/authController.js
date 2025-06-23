// backend/controllers/authController.js
const User = require('../models/User');
const { tokenUtils } = require('../config/jwt');
const { validationResult } = require('express-validator');

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

    // ✅ FIXED: Use firstName/lastName instead of fullName
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

    // ✅ FIXED: Create new user with firstName/lastName
    const user = new User({
      username,
      email,
      password,
      firstName,
      lastName,
      role
    });

    await user.save();

    // Generate tokens using JWT utilities
    const accessToken = tokenUtils.generateToken(user._id, user.role);
    const refreshToken = tokenUtils.generateRefreshToken();

    // Update user with refresh token
    user.refreshToken = refreshToken;
    await user.save();

    // Remove sensitive data from response
    const userResponse = user.toJSON();

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

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json(
        createErrorResponse('Account is inactive. Please contact administrator.')
      );
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json(
        createErrorResponse('Invalid credentials')
      );
    }

    // Generate tokens using JWT utilities
    const accessToken = tokenUtils.generateToken(user._id, user.role);
    const refreshToken = tokenUtils.generateRefreshToken();

    // Update user with refresh token and last login
    user.refreshToken = refreshToken;
    user.lastLogin = new Date();
    await user.save();

    // Remove sensitive data from response
    const userResponse = user.toJSON();

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

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json(
        createErrorResponse('User not found')
      );
    }

    // Remove sensitive data from response
    const userResponse = user.toJSON();

    res.status(200).json(
      createSuccessResponse(
        'Profile retrieved successfully',
        { user: userResponse }
      )
    );

  } catch (error) {
    console.error('Get current user error:', error);
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

    // ✅ FIXED: Use firstName/lastName instead of fullName
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

    // Prepare update object - only include fields that are provided
    const updateFields = {};
    if (firstName !== undefined) updateFields.firstName = firstName;
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (email !== undefined) updateFields.email = email;

    // Update user
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateFields,
      { new: true, runValidators: true }
    );

    if (!updatedUser) {
      return res.status(404).json(
        createErrorResponse('User not found')
      );
    }

    // Remove sensitive data from response
    const userResponse = updatedUser.toJSON();

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
// @route   PUT /api/auth/password
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

    // ✅ ENHANCEMENT: Clear all refresh tokens after password change for security
    user.refreshToken = null;
    await user.save();

    res.status(200).json(
      createSuccessResponse('Password changed successfully. Please login again.')
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

    // ✅ ENHANCED: Verify refresh token using JWT utilities
    let decoded;
    try {
      decoded = tokenUtils.verifyToken(refreshToken);
      
      // Additional check for refresh token type
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
    } catch (error) {
      return res.status(401).json(
        createErrorResponse('Invalid or expired refresh token')
      );
    }

    // Find user with matching refresh token
    const user = await User.findOne({
      refreshToken,
      isActive: true // ✅ ENHANCEMENT: Only allow active users
    });

    if (!user) {
      return res.status(401).json(
        createErrorResponse('Invalid refresh token or inactive user')
      );
    }

    // Generate new tokens using JWT utilities
    const newAccessToken = tokenUtils.generateToken(user._id, user.role);
    const newRefreshToken = tokenUtils.generateRefreshToken();

    // Update user with new refresh token
    user.refreshToken = newRefreshToken;
    await user.save();

    res.status(200).json(
      createSuccessResponse(
        'Token refreshed successfully',
        null,
        { accessToken: newAccessToken, refreshToken: newRefreshToken }
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

// @desc    Validate token (for frontend token checks)
// @route   GET /api/auth/validate
// @access  Private
const validateToken = async (req, res) => {
  try {
    // If we reach here, the token is valid (middleware passed)
    res.status(200).json(
      createSuccessResponse('Token is valid', {
        user: {
          userId: req.user.userId,
          username: req.user.username,
          email: req.user.email,
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          role: req.user.role,
          isActive: req.user.isActive
        }
      })
    );
  } catch (error) {
    console.error('Validate token error:', error);
    res.status(500).json(
      createErrorResponse('Internal server error during token validation')
    );
  }
};

module.exports = {
  register,
  login,
  getCurrentUser,
  updateProfile,
  changePassword,
  refreshToken,
  logout,
  validateToken // ✅ NEW: Added token validation endpoint
};