// backend/models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const USER_ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant',
  CUSTOMER: 'customer'
};

const userSchema = new mongoose.Schema({
  // Basic user information (for registration compatibility)
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    validate: {
      validator: function(v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email'
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
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters']
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES),
    default: USER_ROLES.ASSISTANT
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastLogin: {
    type: Date
  },
  mustChangePassword: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.role === USER_ROLES.ASSISTANT;
    }
  },
  customerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: function() {
      return this.role === USER_ROLES.CUSTOMER;
    }
  },
  isCustomerAccount: {
    type: Boolean,
    default: function() {
      return this.role === USER_ROLES.CUSTOMER;
    }
  },
  accountStatus: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  lastPortalLogin: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  toObject: { virtuals: true }
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to check password
userSchema.methods.comparePassword = async function(password) {
  return await bcrypt.compare(password, this.password);
};

// Method to check portal access
userSchema.methods.canAccessPortal = function() {
  return this.role === USER_ROLES.CUSTOMER && 
         this.accountStatus === 'active';
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
  const user = this.toObject();
  delete user.password;
  return user;
};

// Method to get user data for frontend
userSchema.methods.getPublicData = function() {
  const user = this.toObject();
  delete user.password;
  return {
    _id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: user.fullName,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    accountStatus: user.accountStatus,
    customerProfile: user.customerProfile,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
};

// Get user with customer profile populated
userSchema.methods.getWithProfile = function() {
  return this.populate('customerProfile');
};

// Index for role and account status
userSchema.index({ role: 1, accountStatus: 1 });

// Export the model and USER_ROLES constant
const User = mongoose.model('User', userSchema);
module.exports = User;
module.exports.USER_ROLES = USER_ROLES;