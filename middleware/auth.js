const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Define role hierarchy - updated with customer role
const ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant',
  CUSTOMER: 'customer'
};

// Define comprehensive permissions system
const PERMISSIONS = {
  // Customer management
  CREATE_CUSTOMER: 'create_customer',
  READ_CUSTOMER: 'read_customer',
  UPDATE_CUSTOMER: 'update_customer',
  DELETE_CUSTOMER: 'delete_customer',
  
  // Order management
  CREATE_ORDER: 'create_order',
  READ_ORDER: 'read_order',
  UPDATE_ORDER: 'update_order',
  DELETE_ORDER: 'delete_order',
  
  // User management
  CREATE_USER: 'create_user',
  READ_USER: 'read_user',
  UPDATE_USER: 'update_user',
  DELETE_USER: 'delete_user',
  
  // Message management
  CREATE_MESSAGE: 'create_message',
  READ_MESSAGE: 'read_message',
  UPDATE_MESSAGE: 'update_message',
  DELETE_MESSAGE: 'delete_message',
  REPLY_MESSAGE: 'reply_message',
  
  // Message status management
  MARK_READ: 'mark_read',
  CHANGE_PRIORITY: 'change_priority',
  CLOSE_MESSAGE: 'close_message',
  
  // Message search and analytics
  SEARCH_MESSAGES: 'search_messages',
  VIEW_MESSAGE_STATS: 'view_message_stats',
  
  // Financial data
  READ_FINANCIAL: 'read_financial',
  
  // System administration
  ADMIN_DASHBOARD: 'admin_dashboard',
  ASSISTANT_DASHBOARD: 'assistant_dashboard',
  CUSTOMER_DASHBOARD: 'customer_dashboard'
};

// Role-permission mapping - updated with customer permissions
const ROLE_PERMISSIONS = {
  [ROLES.ADMIN]: [
    // Full system access
    PERMISSIONS.CREATE_CUSTOMER,
    PERMISSIONS.READ_CUSTOMER,
    PERMISSIONS.UPDATE_CUSTOMER,
    PERMISSIONS.DELETE_CUSTOMER,
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.READ_ORDER,
    PERMISSIONS.UPDATE_ORDER,
    PERMISSIONS.DELETE_ORDER,
    PERMISSIONS.CREATE_USER,
    PERMISSIONS.READ_USER,
    PERMISSIONS.UPDATE_USER,
    PERMISSIONS.DELETE_USER,
    // Full message access
    PERMISSIONS.CREATE_MESSAGE,
    PERMISSIONS.READ_MESSAGE,
    PERMISSIONS.UPDATE_MESSAGE,
    PERMISSIONS.DELETE_MESSAGE,
    PERMISSIONS.REPLY_MESSAGE,
    PERMISSIONS.MARK_READ,
    PERMISSIONS.CHANGE_PRIORITY,
    PERMISSIONS.CLOSE_MESSAGE,
    PERMISSIONS.SEARCH_MESSAGES,
    PERMISSIONS.VIEW_MESSAGE_STATS,
    // Financial and dashboard access
    PERMISSIONS.READ_FINANCIAL,
    PERMISSIONS.ADMIN_DASHBOARD
  ],
  [ROLES.ASSISTANT]: [
    // Limited customer management
    PERMISSIONS.READ_CUSTOMER,
    PERMISSIONS.UPDATE_CUSTOMER,
    // Order management
    PERMISSIONS.CREATE_ORDER,
    PERMISSIONS.READ_ORDER,
    PERMISSIONS.UPDATE_ORDER,
    // Message management for assigned customers
    PERMISSIONS.READ_MESSAGE,
    PERMISSIONS.REPLY_MESSAGE,
    PERMISSIONS.MARK_READ,
    PERMISSIONS.CHANGE_PRIORITY,
    PERMISSIONS.CLOSE_MESSAGE,
    PERMISSIONS.SEARCH_MESSAGES,
    PERMISSIONS.VIEW_MESSAGE_STATS,
    // Dashboard access
    PERMISSIONS.ASSISTANT_DASHBOARD
  ],
  [ROLES.CUSTOMER]: [
    // Self-service customer operations
    PERMISSIONS.READ_CUSTOMER,     // Read own profile
    PERMISSIONS.UPDATE_CUSTOMER,   // Update own profile
    // Order access
    PERMISSIONS.READ_ORDER,        // Read own orders
    // Message operations
    PERMISSIONS.CREATE_MESSAGE,    // Create new messages
    PERMISSIONS.READ_MESSAGE,      // Read own messages
    PERMISSIONS.REPLY_MESSAGE,     // Reply to own messages
    PERMISSIONS.MARK_READ,         // Mark own messages as read
    PERMISSIONS.SEARCH_MESSAGES,   // Search own messages
    PERMISSIONS.VIEW_MESSAGE_STATS, // View own message stats
    // Dashboard access
    PERMISSIONS.CUSTOMER_DASHBOARD
  ]
};

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

    // Validate role exists
    if (!Object.values(ROLES).includes(user.role)) {
      return res.status(403).json({ error: 'Invalid user role.' });
    }

    // Attach user and permissions to request
    req.user = user;
    req.user.permissions = ROLE_PERMISSIONS[user.role] || [];

    next();
  } catch (error) {
    console.error('Authentication error:', error);
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

// Permission-based authorization
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Please authenticate.' });
    }

    const userPermissions = req.user.permissions || [];
    
    if (!userPermissions.includes(permission)) {
      return res.status(403).json({ 
        error: `Access denied. Required permission: ${permission}` 
      });
    }

    next();
  };
};

// Multiple permissions authorization
const requirePermissions = (permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Please authenticate.' });
    }

    const userPermissions = req.user.permissions || [];
    const requiredPermissions = Array.isArray(permissions) ? permissions : [permissions];
    
    const hasAllPermissions = requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
    
    if (!hasAllPermissions) {
      return res.status(403).json({ 
        error: `Access denied. Required permissions: ${requiredPermissions.join(', ')}` 
      });
    }

    next();
  };
};

// Check if user is active
const requireActiveUser = () => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Access denied. Please authenticate.' });
    }

    if (!req.user.isActive) {
      return res.status(403).json({ error: 'Account is inactive.' });
    }
    next();
  };
};

// Role-specific middleware
const requireAuth = () => authenticate;
const requireAdmin = () => [authenticate, authorize([ROLES.ADMIN])];
const requireAssistant = () => [authenticate, authorize([ROLES.ASSISTANT])];
const requireCustomer = () => [authenticate, authorize([ROLES.CUSTOMER])];
const requireAdminOrAssistant = () => [authenticate, authorize([ROLES.ADMIN, ROLES.ASSISTANT])];
const requireAdminOrCustomer = () => [authenticate, authorize([ROLES.ADMIN, ROLES.CUSTOMER])];
const requireAnyRole = () => [authenticate, authorize([ROLES.ADMIN, ROLES.ASSISTANT, ROLES.CUSTOMER])];

// Message-specific permission middleware
const requireCanCreateMessage = () => requirePermission(PERMISSIONS.CREATE_MESSAGE);
const requireCanReadMessage = () => requirePermission(PERMISSIONS.READ_MESSAGE);
const requireCanUpdateMessage = () => requirePermission(PERMISSIONS.UPDATE_MESSAGE);
const requireCanDeleteMessage = () => requirePermission(PERMISSIONS.DELETE_MESSAGE);
const requireCanReplyMessage = () => requirePermission(PERMISSIONS.REPLY_MESSAGE);
const requireCanMarkRead = () => requirePermission(PERMISSIONS.MARK_READ);
const requireCanChangePriority = () => requirePermission(PERMISSIONS.CHANGE_PRIORITY);
const requireCanCloseMessage = () => requirePermission(PERMISSIONS.CLOSE_MESSAGE);
const requireCanSearchMessages = () => requirePermission(PERMISSIONS.SEARCH_MESSAGES);
const requireCanViewMessageStats = () => requirePermission(PERMISSIONS.VIEW_MESSAGE_STATS);

// Dashboard access middleware
const requireAdminDashboard = () => requirePermission(PERMISSIONS.ADMIN_DASHBOARD);
const requireAssistantDashboard = () => requirePermission(PERMISSIONS.ASSISTANT_DASHBOARD);
const requireCustomerDashboard = () => requirePermission(PERMISSIONS.CUSTOMER_DASHBOARD);

module.exports = {
  // Core authentication and authorization
  authenticate,
  authorize,
  requirePermission,
  requirePermissions,
  requireActiveUser,
  
  // Role and permission constants
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  
  // Role-specific middleware
  requireAuth,
  requireAdmin,
  requireAssistant,
  requireCustomer,
  requireAdminOrAssistant,
  requireAdminOrCustomer,
  requireAnyRole,
  
  // Message-specific permissions
  requireCanCreateMessage,
  requireCanReadMessage,
  requireCanUpdateMessage,
  requireCanDeleteMessage,
  requireCanReplyMessage,
  requireCanMarkRead,
  requireCanChangePriority,
  requireCanCloseMessage,
  requireCanSearchMessages,
  requireCanViewMessageStats,
  
  // Dashboard permissions
  requireAdminDashboard,
  requireAssistantDashboard,
  requireCustomerDashboard
};