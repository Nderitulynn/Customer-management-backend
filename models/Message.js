const mongoose = require('mongoose');

// Message Schema Definition
const messageSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer ID is required'],
    index: true
  },
  
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming assistants are stored in users collection
    required: [true, 'Assigned assistant is required'],
    index: true
  },
  
  subject: {
    type: String,
    required: [true, 'Message subject is required'],
    trim: true,
    minlength: [5, 'Subject must be at least 5 characters long'],
    maxlength: [200, 'Subject cannot exceed 200 characters']
  },
  
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    minlength: [10, 'Content must be at least 10 characters long'],
    maxlength: [5000, 'Content cannot exceed 5000 characters']
  },
  
  priority: {
    type: String,
    enum: {
      values: ['low', 'medium', 'high'],
      message: 'Priority must be one of: low, medium, high'
    },
    default: 'medium',
    index: true
  },
  
  status: {
    type: String,
    enum: {
      values: ['unread', 'read', 'replied', 'closed'],
      message: 'Status must be one of: unread, read, replied, closed'
    },
    default: 'unread',
    index: true
  },
  
  messageType: {
    type: String,
    enum: {
      values: ['initial', 'reply'],
      message: 'Message type must be one of: initial, reply'
    },
    default: 'initial',
    index: true
  },
  
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance optimization
messageSchema.index({ customerId: 1, status: 1 }); // Customer's unread messages
messageSchema.index({ assignedTo: 1, status: 1 }); // Assistant's unread messages
messageSchema.index({ customerId: 1, createdAt: -1 }); // Customer's recent messages
messageSchema.index({ assignedTo: 1, createdAt: -1 }); // Assistant's recent messages
messageSchema.index({ subject: 'text', content: 'text' }); // Full-text search

// Virtual Fields
messageSchema.virtual('isUnread').get(function() {
  return this.status === 'unread';
});

messageSchema.virtual('isRead').get(function() {
  return this.status === 'read' || this.status === 'replied' || this.status === 'closed';
});

messageSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diff = now - this.createdAt;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  return `${days} day${days > 1 ? 's' : ''} ago`;
});

messageSchema.virtual('priorityLevel').get(function() {
  const levels = { low: 1, medium: 2, high: 3 };
  return levels[this.priority] || 2;
});

// Instance Methods
messageSchema.methods.markAsRead = function(userId = null) {
  this.status = 'read';
  this.readAt = new Date();
  
  // Optional: Track who marked it as read
  if (userId) {
    this.readBy = userId;
  }
  
  return this.save();
};

messageSchema.methods.markAsReplied = function() {
  this.status = 'replied';
  this.updatedAt = new Date();
  
  return this.save();
};

messageSchema.methods.close = function() {
  this.status = 'closed';
  this.updatedAt = new Date();
  
  return this.save();
};

messageSchema.methods.updatePriority = function(newPriority) {
  const validPriorities = ['low', 'medium', 'high'];
  
  if (!validPriorities.includes(newPriority)) {
    throw new Error('Invalid priority level');
  }
  
  this.priority = newPriority;
  this.updatedAt = new Date();
  
  return this.save();
};

// Static Methods for Common Queries
messageSchema.statics.findByCustomer = function(customerId, filters = {}) {
  const query = { customerId, ...filters };
  return this.find(query)
    .populate('customerId', 'name email phone')
    .populate('assistantId', 'username email')
    .sort({ createdAt: -1 });
};

messageSchema.statics.findByAssistant = function(assignedTo, filters = {}) {
  const query = { assignedTo, ...filters };
  return this.find(query)
    .populate('customerId', 'name email phone')
    .populate('assignedTo', 'username email')
    .sort({ createdAt: -1 });
};

messageSchema.statics.getUnreadCount = function(userId, role = 'customer') {
  const query = role === 'customer' 
    ? { customerId: userId, status: 'unread' }
    : { assignedTo: userId, status: 'unread' };
    
  return this.countDocuments(query);
};

messageSchema.statics.getMessageStats = function(userId, role = 'customer') {
  const matchStage = role === 'customer' 
    ? { customerId: mongoose.Types.ObjectId(userId) }
    : { assignedTo: mongoose.Types.ObjectId(userId) };
    
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        unread: { 
          $sum: { $cond: [{ $eq: ['$status', 'unread'] }, 1, 0] }
        },
        read: { 
          $sum: { $cond: [{ $eq: ['$status', 'read'] }, 1, 0] }
        },
        replied: { 
          $sum: { $cond: [{ $eq: ['$status', 'replied'] }, 1, 0] }
        },
        closed: { 
          $sum: { $cond: [{ $eq: ['$status', 'closed'] }, 1, 0] }
        },
        highPriority: {
          $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
        }
      }
    }
  ]);
};

messageSchema.statics.searchMessages = function(query, userId, role = 'customer', options = {}) {
  const {
    page = 1,
    limit = 20,
    status,
    priority,
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = options;
  
  const matchStage = role === 'customer' 
    ? { customerId: mongoose.Types.ObjectId(userId) }
    : { assignedTo: mongoose.Types.ObjectId(userId) };
    
  // Add text search if query provided
  if (query) {
    matchStage.$text = { $search: query };
  }
  
  // Add additional filters
  if (status) matchStage.status = status;
  if (priority) matchStage.priority = priority;
  
  const sortStage = {};
  sortStage[sortBy] = sortOrder === 'desc' ? -1 : 1;
  
  const skip = (page - 1) * limit;
  
  return this.find(matchStage)
    .populate('customerId', 'name email phone')
    .populate('assignedTo', 'username email')
    .sort(sortStage)
    .skip(skip)
    .limit(limit);
};

messageSchema.statics.getRecentActivity = function(userId, role = 'customer', days = 7) {
  const matchStage = role === 'customer' 
    ? { customerId: mongoose.Types.ObjectId(userId) }
    : { assignedTo: mongoose.Types.ObjectId(userId) };
    
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  matchStage.createdAt = { $gte: startDate };
  
  return this.find(matchStage)
    .populate('customerId', 'name email')
    .populate('assignedTo', 'username email')
    .sort({ createdAt: -1 })
    .limit(50);
};

// Pre-save middleware for data validation and processing
messageSchema.pre('save', function(next) {
  // Auto-set readAt when status changes to read
  if (this.isModified('status') && this.status === 'read' && !this.readAt) {
    this.readAt = new Date();
  }
  
  // Ensure content is clean (basic sanitization)
  if (this.isModified('content')) {
    this.content = this.content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
  
  next();
});

// Pre-find middleware to always populate references
messageSchema.pre(/^find/, function(next) {
  // Only populate if not already populated
  if (!this.getPopulatedPaths().includes('customerId')) {
    this.populate('customerId', 'name email phone');
  }
  if (!this.getPopulatedPaths().includes('assignedTo')) {
    this.populate('assignedTo', 'username email');
  }
  
  next();
});

// Model creation
const Message = mongoose.model('Message', messageSchema);

module.exports = Message;