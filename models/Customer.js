// backend/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // Basic Information
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
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
        // Kenyan phone number validation
        // Supports formats like: +254712345678, 0712345678, 712345678
        // Kenyan mobile numbers: 07xx, 01xx (landline)
        const kenyanPhoneRegex = /^(\+254|254|0)?([17]\d{8}|[2-9]\d{7})$/;
        return kenyanPhoneRegex.test(v.replace(/[\s\-]/g, ''));
      },
      message: 'Please enter a valid Kenyan phone number (e.g., +254712345678, 0712345678)'
    }
  },

  // Address Information
  address: {
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    county: { type: String, trim: true }, // Changed from 'state' to 'county' for Kenya
    postalCode: { type: String, trim: true }, // Changed from 'zipCode' to 'postalCode'
    country: { type: String, trim: true, default: 'Kenya' } // Changed default to Kenya
  },

  // Macrame Business Specific
  interests: {
    type: [String],
    enum: ['wall-hangings', 'plant-hangers', 'jewelry', 'bags', 'keychains', 'home-decor', 'other'],
    default: []
  },
  communicationPreference: {
    type: String,
    enum: ['email', 'sms', 'phone', 'whatsapp'],
    default: 'whatsapp' // Changed default to WhatsApp as it's more popular in Kenya
  },

  // Purchase Information
  totalSpent: {
    type: Number,
    default: 0,
    min: [0, 'Total spent cannot be negative']
  },
  averageOrderValue: {
    type: Number,
    default: 0,
    min: [0, 'Average order value cannot be negative']
  },
  orderHistory: [{
    orderId: { type: String, required: true },
    date: { type: Date, default: Date.now },
    amount: { type: Number, required: true, min: 0 },
    items: [{ type: String }],
    status: {
      type: String,
      enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled', 'completed'],
      default: 'pending'
    }
  }],

  // Customer Segmentation (Simplified)
  segment: {
    type: String,
    enum: ['new', 'regular'],
    default: 'new'
  },

  // Last Order Date for Regular Customers
  lastOrderDate: { type: Date },

  // Internal Notes
  notes: { type: String, maxlength: [1000, 'Notes cannot exceed 1000 characters'] },
  tags: [{ type: String, trim: true }],
  
  // Status
  isActive: { type: Boolean, default: true },

  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Made optional for seeding
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ segment: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ lastOrderDate: -1 });

// Virtual for full name
customerSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for formatted phone number
customerSchema.virtual('formattedPhone').get(function() {
  if (!this.phone) return '';
  
  // Remove any spaces or dashes
  let phone = this.phone.replace(/[\s\-]/g, '');
  
  // Add +254 prefix if not present
  if (phone.startsWith('0')) {
    phone = '+254' + phone.substring(1);
  } else if (phone.startsWith('254')) {
    phone = '+' + phone;
  } else if (!phone.startsWith('+254')) {
    phone = '+254' + phone;
  }
  
  return phone;
});

// Virtual for days since last order
customerSchema.virtual('daysSinceLastOrder').get(function() {
  if (!this.lastOrderDate) return null;
  const diffTime = Math.abs(new Date() - this.lastOrderDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to normalize phone number
customerSchema.pre('save', function(next) {
  // Normalize phone number
  if (this.phone) {
    let phone = this.phone.replace(/[\s\-]/g, '');
    
    // Convert to standard format starting with 0
    if (phone.startsWith('+254')) {
      phone = '0' + phone.substring(4);
    } else if (phone.startsWith('254')) {
      phone = '0' + phone.substring(3);
    }
    
    this.phone = phone;
  }

  // Update average order value and last order date
  if (this.orderHistory && this.orderHistory.length > 0) {
    const completedOrders = this.orderHistory.filter(order => 
      order.status === 'completed' || order.status === 'delivered'
    );
    
    if (completedOrders.length > 0) {
      this.averageOrderValue = this.totalSpent / completedOrders.length;
      // Find the most recent completed order date
      const orderDates = completedOrders.map(order => new Date(order.date));
      this.lastOrderDate = new Date(Math.max(...orderDates));
    }
  }

  // Auto-update customer segment (Simplified)
  if (this.totalSpent === 0) {
    this.segment = 'new';
  } else {
    this.segment = 'regular';
  }

  next();
});

// Static methods for analytics
customerSchema.statics.getCustomerStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalCustomers: { $sum: 1 },
        activeCustomers: { $sum: { $cond: ['$isActive', 1, 0] } },
        totalRevenue: { $sum: '$totalSpent' },
        averageSpent: { $avg: '$totalSpent' }
      }
    }
  ]);

  const segmentStats = await this.aggregate([
    { $group: { _id: '$segment', count: { $sum: 1 } } }
  ]);

  return {
    overview: stats[0] || {
      totalCustomers: 0,
      activeCustomers: 0,
      totalRevenue: 0,
      averageSpent: 0
    },
    segments: segmentStats.reduce((acc, seg) => {
      acc[seg._id] = seg.count;
      return acc;
    }, {})
  };
};

// Instance methods
customerSchema.methods.addOrder = function(orderData) {
  this.orderHistory.push(orderData);
  this.totalSpent += orderData.amount;
  return this.save();
};

module.exports = mongoose.model('Customer', customerSchema);