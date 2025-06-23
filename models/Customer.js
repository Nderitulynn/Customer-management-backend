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
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ createdAt: -1 });

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

module.exports = mongoose.model('Customer', customerSchema);