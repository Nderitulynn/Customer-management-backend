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
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
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
customerSchema.index({ createdAt: -1 });
customerSchema.index({ fullName: 'text' }); // Text index for search

// Virtual for customer age/duration
customerSchema.virtual('customerAge').get(function() {
  if (!this.createdAt) return 0;
  const diffTime = Math.abs(new Date() - this.createdAt);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // Days since customer creation
});

// Pre-save middleware to update updatedAt timestamp
customerSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Validation rules
customerSchema.pre('save', function(next) {
  // Ensure required fields are present
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

// ADDED: Static method for customer statistics
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

// ADDED: Static method to get customers by segment
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

// Instance method to update segment based on spending/orders
customerSchema.methods.updateSegment = function() {
  if (this.totalOrders === 0) {
    this.segment = 'new';
  } else if (this.totalSpent >= 10000) { // VIP threshold
    this.segment = 'vip';
  } else if (this.totalOrders >= 5) {
    this.segment = 'regular';
  } else if (this.lastOrderDate && new Date() - this.lastOrderDate > 90 * 24 * 60 * 60 * 1000) {
    this.segment = 'inactive'; // No order in 90 days
  } else {
    this.segment = 'regular';
  }
  
  return this;
};

module.exports = mongoose.model('Customer', customerSchema);