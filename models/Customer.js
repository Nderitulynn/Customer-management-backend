// backend/models/Customer.js
const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  // Core customer information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    minlength: [2, 'Full name must be at least 2 characters'],
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    }
  },
  
  phone: {
    type: String,
    required: false,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v || v.trim() === '') return true;
        const phoneRegex = /^[\+]?[\s\-\(\)]?[\d\s\-\(\)]{10,}$/;
        return phoneRegex.test(v);
      },
      message: 'Please enter a valid phone number'
    }
  },
  
  // Additional customer-specific information
  address: {
    type: String,
    trim: true,
    maxlength: [500, 'Address cannot exceed 500 characters']
  },
  
  // Customer Notes
  notes: { 
    type: String, 
    maxlength: [1000, 'Notes cannot exceed 1000 characters'] 
  },
  
  // Assignment
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Customer access permissions
  hasAccess: {
    type: Boolean,
    default: true
  },

  // Active status for business operations
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toObject: { virtuals: true }
});

// ============ VIRTUAL FIELDS ============
// Get the associated User account for authentication data
customerSchema.virtual('userAccount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'customerProfile',
  justOne: true
});

// Virtual fields to get name parts from fullName
customerSchema.virtual('firstName').get(function() {
  if (this.fullName) {
    return this.fullName.split(' ')[0];
  }
  return null;
});

customerSchema.virtual('lastName').get(function() {
  if (this.fullName) {
    const parts = this.fullName.split(' ');
    return parts.length > 1 ? parts.slice(1).join(' ') : '';
  }
  return null;
});

// ============ INDEXES ============
// Note: email index is automatically created by unique: true
customerSchema.index({ phone: 1 });
customerSchema.index({ assignedTo: 1 });
customerSchema.index({ fullName: 1 });

// ============ METHODS ============
// Get customer profile data
customerSchema.methods.getProfileData = async function() {
  return {
    _id: this._id,
    firstName: this.firstName,
    lastName: this.lastName,
    fullName: this.fullName,
    email: this.email,
    phone: this.phone,
    address: this.address,
    notes: this.notes,
    hasAccess: this.hasAccess,
    isActive: this.isActive,
    assignedTo: this.assignedTo,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
};

// Update customer profile
customerSchema.methods.updateProfile = function(updateData) {
  const allowedUpdates = ['fullName', 'email', 'phone', 'address', 'notes', 'assignedTo', 'hasAccess', 'isActive'];
  
  allowedUpdates.forEach(field => {
    if (updateData[field] !== undefined) {
      this[field] = updateData[field];
    }
  });
  
  return this.save();
};

// Get customer with user account
customerSchema.methods.getWithUserAccount = function() {
  return this.populate('userAccount');
};

// ============ STATIC METHODS ============
// Find customer by user ID
customerSchema.statics.findByUserId = function(userId) {
  return this.model('User').findById(userId).populate('customerProfile');
};

// Search customers by customer data directly
customerSchema.statics.searchCustomers = async function(searchTerm) {
  return this.find({
    $or: [
      { fullName: { $regex: searchTerm, $options: 'i' } },
      { email: { $regex: searchTerm, $options: 'i' } },
      { phone: { $regex: searchTerm, $options: 'i' } }
    ]
  });
};

// Find customers by email
customerSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

// Find customers assigned to a user
customerSchema.statics.findByAssignedUser = function(userId) {
  return this.find({ assignedTo: userId });
};

// Find active customers
customerSchema.statics.findActive = function() {
  return this.find({ isActive: true });
};

module.exports = mongoose.model('Customer', customerSchema);