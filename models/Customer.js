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
        // International phone number validation
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

  // Status and Source
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

  // ADDED: Missing fields from routes
  isActive: {
    type: Boolean,
    default: true
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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

  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // UPDATED: Assignment fields - now supports unassigned state
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null  // CHANGED: Made optional to allow unassigned customers
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null  // NEW: Who made the assignment (admin or self for claiming)
  },
  assignedAt: {
    type: Date,
    default: null  // NEW: When the assignment was made
  },
  claimedAt: {
    type: Date,
    default: null  // NEW: When assistant claimed the customer
  },
  
  // NEW: Assignment history tracking
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

// Indexes for performance
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ status: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ segment: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ assignedAt: -1 });  // NEW: For assignment queries
customerSchema.index({ claimedAt: -1 });   // NEW: For claimed customer queries
customerSchema.index({ assignedBy: 1 });   // NEW: For assignment tracking
customerSchema.index({ createdAt: -1 });
customerSchema.index({ fullName: 'text' }); // Text index for search
customerSchema.index({ orderHistory: 1 }); // Index for order history queries

// Virtual for customer age/duration
customerSchema.virtual('customerAge').get(function() {
  if (!this.createdAt) return 0;
  const diffTime = Math.abs(new Date() - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Days since customer creation
});

// NEW: Virtual for assignment status
customerSchema.virtual('assignmentStatus').get(function() {
  if (!this.assignedTo) return 'unassigned';
  if (this.claimedAt) return 'claimed';
  return 'assigned';
});

// Pre-save middleware to update updatedAt timestamp
customerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// UPDATED: Validation rules - removed assignedTo requirement
customerSchema.pre('save', function(next) {
  // Ensure required fields are present (assignedTo no longer required)
  if (!this.fullName || !this.email || !this.phone) {
    return next(new Error('Full name, email, and phone are required'));
  }
  
  // Validate email format
  const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
  if (!emailRegex.test(this.email)) {
    return next(new Error('Please provide a valid email address'));
  }

  next();
});

// EXISTING: Static method for customer statistics
customerSchema.statics.getStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        activeCustomers: { $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] } },
        totalSpent: { $sum: '$totalSpent' },
        averageSpent: { $avg: '$totalSpent' },
        totalOrders: { $sum: '$totalOrders' }
      }
    }
  ]);

  const segmentStats = await this.aggregate([
    { 
      $group: { 
        _id: '$segment', 
        count: { $sum: 1 },
        totalSpent: { $sum: '$totalSpent' },
        avgSpent: { $avg: '$totalSpent' }
      } 
    }
  ]);

  const sourceStats = await this.aggregate([
    { 
      $group: { 
        _id: '$source', 
        count: { $sum: 1 } 
      } 
    }
  ]);

  return {
    overview: stats[0] || {
      totalCustomers: 0,
      activeCustomers: 0,
      totalSpent: 0,
      averageSpent: 0,
      totalOrders: 0
    },
    bySegment: segmentStats.reduce((acc, stat) => {
      acc[stat._id] = { 
        count: stat.count, 
        totalSpent: stat.totalSpent || 0,
        avgSpent: stat.avgSpent || 0
      };
      return acc;
    }, {}),
    bySource: sourceStats.reduce((acc, stat) => {
      acc[stat._id] = stat.count;
      return acc;
    }, {})
  };
};

// EXISTING: Static method to get customers by segment
customerSchema.statics.getBySegment = async function(segment, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;

  const query = { segment, isActive: true };
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const customers = await this.find(query)
    .populate('assignedTo', 'fullName')
    .populate('createdBy', 'fullName')
    .populate('orderHistory', 'orderNumber totalAmount status createdAt')
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

// NEW: Get unassigned customers (for assistant claiming)
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

// NEW: Get customers by assistant (for "my customers" view)
customerSchema.statics.getCustomersByAssistant = async function(assistantId, options = {}) {
  const {
    page = 1,
    limit = 10,
    sortBy = 'assignedAt',
    sortOrder = 'desc'
  } = options;

  const query = { 
    assignedTo: assistantId, 
    isActive: true 
  };
  
  const skip = (page - 1) * limit;
  const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

  const customers = await this.find(query)
    .populate('createdBy', 'fullName')
    .populate('assignedBy', 'fullName')
    .populate('orderHistory', 'orderNumber totalAmount status createdAt')
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

// NEW: Get assignment workload statistics
customerSchema.statics.getAssignmentStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        assignedCustomers: { $sum: { $cond: [{ $ne: ['$assignedTo', null] }, 1, 0] } },
        unassignedCustomers: { $sum: { $cond: [{ $eq: ['$assignedTo', null] }, 1, 0] } },
        claimedCustomers: { $sum: { $cond: [{ $ne: ['$claimedAt', null] }, 1, 0] } }
      }
    }
  ]);

  const assistantWorkload = await this.aggregate([
    {
      $match: { assignedTo: { $ne: null } }
    },
    {
      $group: {
        _id: '$assignedTo',
        customerCount: { $sum: 1 },
        totalSpent: { $sum: '$totalSpent' },
        avgSpent: { $avg: '$totalSpent' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'assistant'
      }
    },
    {
      $project: {
        assistantId: '$_id',
        assistantName: { $arrayElemAt: ['$assistant.fullName', 0] },
        customerCount: 1,
        totalSpent: 1,
        avgSpent: 1
      }
    },
    {
      $sort: { customerCount: -1 }
    }
  ]);

  return {
    overview: stats[0] || {
      totalCustomers: 0,
      assignedCustomers: 0,
      unassignedCustomers: 0,
      claimedCustomers: 0
    },
    assistantWorkload
  };
};

// EXISTING: Instance method to add order to history
customerSchema.methods.addOrderToHistory = function(orderId) {
  if (!this.orderHistory.includes(orderId)) {
    this.orderHistory.push(orderId);
  }
  return this;
};

// EXISTING: Instance method to remove order from history
customerSchema.methods.removeOrderFromHistory = function(orderId) {
  this.orderHistory = this.orderHistory.filter(id => !id.equals(orderId));
  return this;
};

// NEW: Method to claim customer (assistant self-assignment)
customerSchema.methods.claimCustomer = function(assistantId) {
  if (this.assignedTo && this.assignedTo.toString() !== assistantId.toString()) {
    throw new Error('Customer is already assigned to another assistant');
  }
  
  this.assignedTo = assistantId;
  this.assignedBy = assistantId;
  this.assignedAt = new Date();
  this.claimedAt = new Date();
  
  this.assignmentHistory.push({
    assignedTo: assistantId,
    assignedBy: assistantId,
    assignedAt: new Date(),
    action: 'claimed'
  });
  
  return this;
};

// NEW: Method to reassign customer (admin action)
customerSchema.methods.reassignCustomer = function(newAssistantId, adminId, reason = null) {
  const previousAssignedTo = this.assignedTo;
  
  this.assignedTo = newAssistantId;
  this.assignedBy = adminId;
  this.assignedAt = new Date();
  this.claimedAt = null; // Reset claimed date for reassignment
  
  this.assignmentHistory.push({
    assignedTo: newAssistantId,
    assignedBy: adminId,
    assignedAt: new Date(),
    action: previousAssignedTo ? 'reassigned' : 'assigned',
    reason: reason
  });
  
  return this;
};

// NEW: Method to unassign customer (admin action)
customerSchema.methods.unassignCustomer = function(adminId, reason = null) {
  this.assignedTo = null;
  this.assignedBy = null;
  this.assignedAt = null;
  this.claimedAt = null;
  
  this.assignmentHistory.push({
    assignedTo: null,
    assignedBy: adminId,
    assignedAt: new Date(),
    action: 'unassigned',
    reason: reason
  });
  
  return this;
};

module.exports = mongoose.model('Customer', customerSchema);