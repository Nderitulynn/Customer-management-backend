const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { USER_ROLES } = require('../../utils/constants');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters'],
    match: [/^[a-zA-Z0-9]+$/, 'Username can only contain letters and numbers']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    validate: {
      validator: function(password) {
        // Password must contain: letters, numbers, and special characters
        return /^(?=.*[a-zA-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/.test(password);
      },
      message: 'Password must contain letters, numbers, and special characters'
    }
  },
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [100, 'Full name cannot exceed 100 characters']
  },
  role: {
    type: String,
    enum: Object.values(USER_ROLES), // Uses constants instead of hardcoded values
    default: USER_ROLES.ASSISTANT,   // Uses constant instead of hardcoded string
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLogin: {
    type: Date,
    default: null
  },
  refreshToken: {
    type: String,
    default: null
  }
});

// Create indexes for performance
userSchema.index({ username: 1 });
userSchema.index({ email: 1 });

// Pre-save hook to hash passwords with bcrypt (12 rounds)
userSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) return next();
  
  try {
    // Hash password with cost of 12
    const hashedPassword = await bcrypt.hash(this.password, 12);
    this.password = hashedPassword;
    next();
  } catch (error) {
    next(error);
  }
});

// Password comparison method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// JSON transform to exclude password from responses
userSchema.methods.toJSON = function() {
  const userObject = this.toObject();
  delete userObject.password;
  delete userObject.refreshToken;
  return userObject;
};

// Static method to find user by credentials
userSchema.statics.findByCredentials = async function(username, password) {
  const user = await this.findOne({ 
    $or: [{ username }, { email: username }],
    isActive: true 
  });
  
  if (!user) {
    throw new Error('Invalid login credentials');
  }
  
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new Error('Invalid login credentials');
  }
  
  return user;
};

// Update last login method
userSchema.methods.updateLastLogin = function() {
  this.lastLogin = new Date();
  return this.save();
};

// Method to check if user has specific permission
userSchema.methods.hasPermission = function(permission) {
  const { PERMISSIONS } = require('../../utils/constants');
  return PERMISSIONS[this.role]?.includes(permission) || false;
};

// Method to check if user is admin
userSchema.methods.isAdmin = function() {
  return this.role === USER_ROLES.ADMIN;
};

const User = mongoose.model('User', userSchema);

module.exports = User;