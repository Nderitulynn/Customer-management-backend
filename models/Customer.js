// backend/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // Basic Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    validate: {
      validator: function(v) {
        const phoneRegex = /^\+?[1-9]\d{1,14}$/;
        return phoneRegex.test(v.replace(/[\s\-]/g, ''));
      },
      message: 'Please enter a valid phone number'
    }
  },

  // Address Information
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    country: { type: String, trim: true }
  },

  // Customer Preferences
  preferences: {
    colors: [{ type: String, trim: true }],
    styles: [{ type: String, trim: true }],
    sizePreferences: { type: String, trim: true }
  },

  // Customer Notes
  notes: { 
    type: String, 
    maxlength: [1000, 'Notes cannot exceed 1000 characters'] 
  },

  // Order History References
  orderHistory: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order'
  }],

  // Status Fields
  isActive: {
    type: Boolean,
    default: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  source: {
    type: String,
    enum: ['whatsapp', 'referral', 'social', 'other'],
    required: true
  },
  segment: {
    type: String,
    enum: ['new', 'regular', 'vip', 'inactive'],
    default: 'new'
  },

  // Business Metrics
  totalOrders: {
    type: Number,
    default: 0,
    min: [0, 'Total orders cannot be negative']
  },
  totalSpent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative']
  },
  lastOrderDate: { 
    type: Date 
  },

  // Assignment Fields
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  assignedAt: {
    type: Date,
    default: null
  },

  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Assignment History (Simplified)
  assignmentHistory: [{
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    assignedAt: {
      type: Date,
      default: Date.now
    },
    action: {
      type: String,
      enum: ['claimed', 'assigned', 'reassigned', 'unassigned'],
      required: true
    },
    reason: {
      type: String,
      maxlength: [200, 'Reason cannot exceed 200 characters']
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Basic Indexes
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ fullName: 'text' });

// Virtual for assignment status
customerSchema.virtual('assignmentStatus').get(function() {
  return this.assignedTo ? 'assigned' : 'unassigned';
});

// Pre-save middleware
customerSchema.pre('save', function(next) {
  this.lastUpdatedBy = this.lastUpdatedBy || this.createdBy;
  next();
});

// ===========================================
// STATIC METHODS (Class-level operations)
// ===========================================

// Create customer
customerSchema.statics.createCustomer = async function(customerData, createdBy) {
  const customer = new this({
    ...customerData,
    createdBy: createdBy
  });
  
  await customer.save();
  return await this.findById(customer._id)
    .populate('createdBy', 'fullName')
    .populate('assignedTo', 'fullName');
};

// Get all customers with role-based filtering
customerSchema.statics.getAllCustomers = async function(userId, userRole, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    search = '',
    status = 'all'
  } = options;

  // Build query based on role
  let query = { isActive: true };
  
  if (userRole === 'assistant') {
    query.assignedTo = userId;
  }
  
  if (status !== 'all') {
    query.status = status;
  }
  
  if (search) {
    query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const customers = await this.find(query)
    .populate('assignedTo', 'fullName')
    .populate('createdBy', 'fullName')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments(query);

  return {
    customers,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

// Get single customer
customerSchema.statics.getCustomerById = async function(customerId, userId, userRole) {
  const customer = await this.findById(customerId)
    .populate('assignedTo', 'fullName')
    .populate('createdBy', 'fullName')
    .populate('orderHistory', 'orderNumber totalAmount status createdAt');

  if (!customer || !customer.isActive) {
    throw new Error('Customer not found');
  }

  // Check access permissions
  if (userRole === 'assistant' && customer.assignedTo?.toString() !== userId.toString()) {
    throw new Error('Access denied: You can only view your assigned customers');
  }

  return customer;
};

// Get unassigned customers (for assistant claiming)
customerSchema.statics.getUnassignedCustomers = async function(options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;

  const query = { 
    assignedTo: null, 
    isActive: true 
  };
  
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const customers = await this.find(query)
    .populate('createdBy', 'fullName')
    .sort(sort)
    .skip(skip)
    .limit(limit);

  const total = await this.countDocuments(query);

  return {
    customers,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      hasNext: page < Math.ceil(total / limit),
      hasPrev: page > 1
    }
  };
};

// Basic statistics
customerSchema.statics.getBasicStats = async function(userId, userRole) {
  let matchQuery = { isActive: true };
  
  if (userRole === 'assistant') {
    matchQuery.assignedTo = userId;
  }

  const stats = await this.aggregate([
    { $match: matchQuery },
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        totalSpent: { $sum: '$totalSpent' },
        totalOrders: { $sum: '$totalOrders' },
        averageSpent: { $avg: '$totalSpent' }
      }
    }
  ]);

  return stats[0] || {
    totalCustomers: 0,
    totalSpent: 0,
    totalOrders: 0,
    averageSpent: 0
  };
};

// ===========================================
// INSTANCE METHODS (Document-level operations)
// ===========================================

// Check access permissions
customerSchema.methods.checkAccess = function(userId, userRole, action) {
  // Admin has full access
  if (userRole === 'admin') {
    return true;
  }

  // Assistant access rules
  if (userRole === 'assistant') {
    switch (action) {
      case 'read':
      case 'update':
        return this.assignedTo?.toString() === userId.toString();
      case 'claim':
        return !this.assignedTo; // Can only claim unassigned
      case 'delete':
        return false; // Assistants cannot delete
      default:
        return false;
    }
  }

  return false;
};

// Update customer information
customerSchema.methods.updateCustomer = async function(updateData, userId, userRole) {
  // Check permissions
  if (!this.checkAccess(userId, userRole, 'update')) {
    throw new Error('Access denied: You can only update your assigned customers');
  }

  // Prevent updating sensitive fields
  const allowedFields = [
    'fullName', 'email', 'phone', 'address', 'preferences', 
    'notes', 'status', 'segment'
  ];

  const filteredData = {};
  Object.keys(updateData).forEach(key => {
    if (allowedFields.includes(key)) {
      filteredData[key] = updateData[key];
    }
  });

  // Update fields
  Object.assign(this, filteredData);
  this.lastUpdatedBy = userId;

  await this.save();
  return this;
};

// Soft delete customer (Admin only)
customerSchema.methods.softDelete = async function(userId, userRole) {
  if (userRole !== 'admin') {
    throw new Error('Access denied: Only admins can delete customers');
  }

  this.isActive = false;
  this.status = 'inactive';
  this.lastUpdatedBy = userId;

  await this.save();
  return this;
};

// Claim customer (Assistant self-assignment)
customerSchema.methods.claimCustomer = async function(assistantId, userRole) {
  if (userRole !== 'assistant') {
    throw new Error('Access denied: Only assistants can claim customers');
  }

  if (this.assignedTo) {
    throw new Error('Customer is already assigned to another assistant');
  }

  this.assignedTo = assistantId;
  this.assignedBy = assistantId;
  this.assignedAt = new Date();
  this.lastUpdatedBy = assistantId;

  // Add to assignment history
  this.assignmentHistory.push({
    assignedTo: assistantId,
    assignedBy: assistantId,
    assignedAt: new Date(),
    action: 'claimed'
  });

  await this.save();
  return this;
};

// Reassign customer (Admin only)
customerSchema.methods.reassignCustomer = async function(newAssistantId, adminId, userRole, reason = null) {
  if (userRole !== 'admin') {
    throw new Error('Access denied: Only admins can reassign customers');
  }

  const previousAssignedTo = this.assignedTo;
  
  this.assignedTo = newAssistantId;
  this.assignedBy = adminId;
  this.assignedAt = new Date();
  this.lastUpdatedBy = adminId;

  // Add to assignment history
  this.assignmentHistory.push({
    assignedTo: newAssistantId,
    assignedBy: adminId,
    assignedAt: new Date(),
    action: previousAssignedTo ? 'reassigned' : 'assigned',
    reason: reason
  });

  await this.save();
  return this;
};

// Unassign customer (Admin only)
customerSchema.methods.unassignCustomer = async function(adminId, userRole, reason = null) {
  if (userRole !== 'admin') {
    throw new Error('Access denied: Only admins can unassign customers');
  }

  this.assignedTo = null;
  this.assignedBy = null;
  this.assignedAt = null;
  this.lastUpdatedBy = adminId;

  // Add to assignment history
  this.assignmentHistory.push({
    assignedTo: null,
    assignedBy: adminId,
    assignedAt: new Date(),
    action: 'unassigned',
    reason: reason
  });

  await this.save();
  return this;
};

// Add order to history
customerSchema.methods.addOrderToHistory = function(orderId) {
  if (!this.orderHistory.includes(orderId)) {
    this.orderHistory.push(orderId);
  }
  return this;
};

// Remove order from history
customerSchema.methods.removeOrderFromHistory = function(orderId) {
  this.orderHistory = this.orderHistory.filter(id => !id.equals(orderId));
  return this;
};

module.exports = mongoose.model('Customer', customerSchema);