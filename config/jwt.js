// backend/config/jwt.js
const jwt = require('jsonwebtoken');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const User = require('../models/User');

// JWT Configuration Options
const jwtOptions = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET,
  jsonWebTokenOptions: {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  }
};

// Passport JWT Strategy
const jwtStrategy = new JwtStrategy(jwtOptions, async (payload, done) => {
  try {
    // Find user by ID from token payload
    const user = await User.findById(payload.userId).select('-password -refreshToken');
    
    if (!user) {
      return done(null, false, { message: 'User not found' });
    }

    // Check if user is active
    if (!user.isActive) {
      return done(null, false, { message: 'User account is inactive' });
    }

    // Return user object for req.user - FIXED: Use firstName/lastName
    return done(null, {
      userId: user._id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,  // ✅ Fixed: Use actual field names
      lastName: user.lastName,    // ✅ Fixed: Use actual field names
      role: user.role,
      isActive: user.isActive
    });

  } catch (error) {
    console.error('JWT Strategy error:', error);
    return done(error, false);
  }
});

// Token Utilities
const tokenUtils = {
  /**
   * Generate JWT access token
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @returns {string} JWT token
   */
  generateToken: (userId, role) => {
    const payload = {
      userId,
      role,
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });
  },

  /**
   * Generate refresh token
   * @returns {string} Refresh token
   */
  generateRefreshToken: () => {
    const payload = {
      type: 'refresh',
      random: Math.random().toString(36).substring(2),
      iat: Math.floor(Date.now() / 1000)
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '30d' // Refresh tokens last longer
    });
  },

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {object} Decoded token payload
   */
  verifyToken: (token) => {
    try {
      return jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  },

  /**
   * Decode token without verification (for debugging)
   * @param {string} token - JWT token to decode
   * @returns {object} Decoded token payload
   */
  decodeToken: (token) => {
    return jwt.decode(token);
  },

  /**
   * Check if token is expired
   * @param {string} token - JWT token to check
   * @returns {boolean} True if expired
   */
  isTokenExpired: (token) => {
    try {
      const decoded = jwt.decode(token);
      const currentTime = Math.floor(Date.now() / 1000);
      return decoded.exp < currentTime;
    } catch (error) {
      return true;
    }
  }
};

// Export configuration
module.exports = {
  jwtStrategy,
  jwtOptions,
  tokenUtils
};