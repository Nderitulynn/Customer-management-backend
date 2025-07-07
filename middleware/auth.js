const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'Token is not valid.' });
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token is not valid.' });
  }
};

// Authorization middleware
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Please authenticate.' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    next();
  };
};

// Check if user is active
const requireActiveUser = () => {
  return (req, res, next) => {
    if (!req.user.isActive) {
      return res.status(403).json({ error: 'Account is inactive.' });
    }
    next();
  };
};

// Convenience functions
const requireAuth = () => authenticate;
const requireAdmin = () => [authenticate, authorize(['admin'])];
const requireAssistant = () => [authenticate, authorize(['assistant'])];

module.exports = {
  authenticate,
  authorize,
  requireActiveUser,
  requireAuth,
  requireAdmin,
  requireAssistant
};