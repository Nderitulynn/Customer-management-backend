// backend/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // Basic Information - Updated to use single fullName field
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters'],
    minlength: [2, 'Full name must be at least 2 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    // Updated to match User model email validation
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email'
    }
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

  // Simplified Status - Removed redundant 'status' field, keeping only 'isActive'
  isActive: {
    type: Boolean,
    default: true
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

  // Simple Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: true,
  toObject: { virtuals: true }
});

// Basic Indexes - Updated to use fullName instead of firstName/lastName
customerSchema.index({ email: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ fullName: 'text' }); // Updated text index

module.exports = mongoose.model('Customer', customerSchema);