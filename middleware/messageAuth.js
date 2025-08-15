const Message = require('../models/Message');
const Customer = require('../models/Customer');
const { ROLES } = require('./auth');

// Middleware to validate message access based on user role and ownership
const requireMessageAccess = () => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const messageId = req.params.id || req.params.messageId;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admins have full access to all messages
      if (user.role === ROLES.ADMIN) {
        return next();
      }

      if (!messageId) {
        return res.status(400).json({ error: 'Message ID is required' });
      }

      // Find the message and populate necessary references
      const message = await Message.findById(messageId)
        .populate('customerId', '_id assignedTo')
        .populate('assignedTo', '_id');
      
      if (!message) {
        return res.status(404).json({ error: 'Message not found' });
      }

      // Validate access based on user role
      if (user.role === ROLES.CUSTOMER) {
        // Customers can only access their own messages
        if (!user.customerProfile || message.customerId._id.toString() !== user.customerProfile.toString()) {
          return res.status(403).json({ 
            error: 'Access denied - you can only access your own messages' 
          });
        }
      } else if (user.role === ROLES.ASSISTANT) {
        // Assistants can only access messages from their assigned customers
        const customer = message.customerId;
        if (!customer.assignedTo || customer.assignedTo.toString() !== user._id.toString()) {
          return res.status(403).json({ 
            error: 'Access denied - message not from your assigned customer' 
          });
        }
      }

      // Attach message to request for use in controllers
      req.message = message;
      next();
    } catch (error) {
      console.error('Message access validation error:', error);
      return res.status(500).json({ error: 'Error validating message access' });
    }
  };
};

// Middleware to set query context based on user role for message operations
const setMessageQueryContext = () => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Initialize message context
      req.messageContext = {
        role: user.role,
        userId: user._id
      };

      // Set query filters based on user role
      if (user.role === ROLES.ADMIN) {
        // Admins can see all messages - no filter needed
        req.messageContext.filter = {};
        req.messageContext.scope = 'all';
      } else if (user.role === ROLES.CUSTOMER) {
        // Customers only see their own messages
        if (!user.customerProfile) {
          return res.status(403).json({ error: 'Customer profile not found' });
        }
        req.messageContext.filter = { customerId: user.customerProfile };
        req.messageContext.scope = 'customer';
        req.messageContext.customerProfileId = user.customerProfile;
      } else if (user.role === ROLES.ASSISTANT) {
        // Assistants only see messages from their assigned customers
        const assignedCustomers = await Customer.find({ assignedTo: user._id }).select('_id');
        const customerIds = assignedCustomers.map(customer => customer._id);
        
        if (customerIds.length === 0) {
          // Assistant has no assigned customers
          req.messageContext.filter = { customerId: { $in: [] } }; // Empty result
        } else {
          req.messageContext.filter = { customerId: { $in: customerIds } };
        }
        req.messageContext.scope = 'assistant';
        req.messageContext.assignedCustomerIds = customerIds;
      }

      next();
    } catch (error) {
      console.error('Message context setup error:', error);
      return res.status(500).json({ error: 'Error setting up message context' });
    }
  };
};

// Middleware to validate message creation permissions for customers
const requireMessageCreationAccess = () => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Admins can create messages (for testing/support)
      if (user.role === ROLES.ADMIN) {
        return next();
      }

      // Only customers can create new message threads
      if (user.role !== ROLES.CUSTOMER) {
        return res.status(403).json({ 
          error: 'Only customers can create new messages' 
        });
      }

      // Ensure customer has a linked profile
      if (!user.customerProfile) {
        return res.status(403).json({ error: 'Customer profile not found' });
      }

      // Validate customer exists and has assigned assistant
      const customer = await Customer.findById(user.customerProfile);
      if (!customer) {
        return res.status(404).json({ error: 'Customer record not found' });
      }

      if (!customer.assignedTo) {
        return res.status(403).json({ 
          error: 'No assistant assigned. Please contact support.' 
        });
      }

      // Add customer context to request for message creation
      req.customerContext = {
        customerId: customer._id,
        assignedTo: customer.assignedTo
      };

      next();
    } catch (error) {
      console.error('Message creation validation error:', error);
      return res.status(500).json({ 
        error: 'Error validating message creation permissions' 
      });
    }
  };
};

// Middleware for customer-specific message operations
const requireCustomerAccess = () => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admins can perform customer operations for testing/support
    if (user.role === ROLES.ADMIN) {
      return next();
    }

    // Only customers can perform customer-specific operations
    if (user.role !== ROLES.CUSTOMER) {
      return res.status(403).json({ error: 'Customer role required' });
    }

    // Ensure customer has a linked profile
    if (!user.customerProfile) {
      return res.status(403).json({ error: 'Customer profile not found' });
    }

    next();
  };
};

// Middleware for assistant-specific message operations
const requireAssistantAccess = () => {
  return (req, res, next) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Admins have full access
    if (user.role === ROLES.ADMIN) {
      return next();
    }

    // Only assistants can perform assistant-specific operations
    if (user.role !== ROLES.ASSISTANT) {
      return res.status(403).json({ error: 'Assistant role required' });
    }

    next();
  };
};

// Helper function to validate if user can access specific customer's messages
const canAccessCustomerMessages = async (userId, userRole, customerId) => {
  try {
    if (userRole === ROLES.ADMIN) {
      return true;
    }

    if (userRole === ROLES.CUSTOMER) {
      // Customer can only access their own messages
      const User = require('../models/User');
      const user = await User.findById(userId);
      return user && user.customerProfile && 
             user.customerProfile.toString() === customerId.toString();
    }

    if (userRole === ROLES.ASSISTANT) {
      // Assistant can only access messages from assigned customers
      const customer = await Customer.findById(customerId);
      return customer && customer.assignedTo && 
             customer.assignedTo.toString() === userId.toString();
    }

    return false;
  } catch (error) {
    console.error('Error checking customer message access:', error);
    return false;
  }
};

// Middleware to validate customer-assistant relationship
const validateCustomerAssignment = () => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const customerId = req.params.customerId || req.body.customerId;

      if (!user || !customerId) {
        return res.status(400).json({ error: 'User and customer ID required' });
      }

      // Admin can access any customer
      if (user.role === ROLES.ADMIN) {
        return next();
      }

      const hasAccess = await canAccessCustomerMessages(user._id, user.role, customerId);
      
      if (!hasAccess) {
        return res.status(403).json({ 
          error: 'Access denied - customer not assigned to you' 
        });
      }

      next();
    } catch (error) {
      console.error('Customer assignment validation error:', error);
      return res.status(500).json({ 
        error: 'Error validating customer assignment' 
      });
    }
  };
};

// Utility function to get message context for user
const getMessageContextForUser = async (user) => {
  if (user.role === ROLES.ADMIN) {
    return { filter: {}, scope: 'all' };
  } else if (user.role === ROLES.CUSTOMER) {
    return { 
      filter: { customerId: user.customerProfile }, 
      scope: 'customer',
      customerProfileId: user.customerProfile 
    };
  } else if (user.role === ROLES.ASSISTANT) {
    const assignedCustomers = await Customer.find({ assignedTo: user._id }).select('_id');
    const customerIds = assignedCustomers.map(customer => customer._id);
    return { 
      filter: { customerId: { $in: customerIds } }, 
      scope: 'assistant',
      assignedCustomerIds: customerIds 
    };
  }
  return { filter: { customerId: { $in: [] } }, scope: 'none' };
};

module.exports = {
  // Main middleware functions
  requireMessageAccess,
  setMessageQueryContext,
  requireMessageCreationAccess,
  requireCustomerAccess,
  requireAssistantAccess,
  validateCustomerAssignment,
  
  // Helper functions
  canAccessCustomerMessages,
  getMessageContextForUser
};