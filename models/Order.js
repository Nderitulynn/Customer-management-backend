const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Auto-generated order number with proper format
  orderNumber: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      // Generate format: ORD-YYYYMMDD-XXXXX
      const date = new Date();
      const dateStr = date.getFullYear() + 
                     String(date.getMonth() + 1).padStart(2, '0') + 
                     String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
      return `ORD-${dateStr}-${random}`;
    }
  },

  // Customer Reference
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer reference is required']
  },

  // Order Items
  items: [{
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1']
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    }
  }],

  // Order Total
  orderTotal: {
    type: Number,
    required: [true, 'Order total is required'],
    min: [0, 'Order total cannot be negative']
  },

  // Order Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },

  // Creation Date (replaces dueDate)
  creationDate: {
    type: Date,
    default: Date.now,
    required: true
  },

  // Received By (Assistant who received the order)
  receivedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Order must be received by a user']
  },

  // Created By (Assistant who created the order)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Created by reference is required']
  },

  // Payment Status
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'partial', 'refunded'],
    default: 'pending'
  },

  // Order Notes
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    default: ''
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save middleware to ensure unique order numbers
orderSchema.pre('save', async function(next) {
  if (this.isNew && !this.orderNumber) {
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      // Generate new order number
      const date = new Date();
      const dateStr = date.getFullYear() + 
                     String(date.getMonth() + 1).padStart(2, '0') + 
                     String(date.getDate()).padStart(2, '0');
      const random = Math.floor(Math.random() * 99999).toString().padStart(5, '0');
      this.orderNumber = `ORD-${dateStr}-${random}`;
      
      // Check if it exists
      const existing = await mongoose.model('Order').findOne({
        orderNumber: this.orderNumber
      });
      
      if (!existing) {
        isUnique = true;
      }
      attempts++;
    }
    
    if (!isUnique) {
      return next(new Error('Failed to generate unique order number'));
    }
  }
  next();
});

// Virtual field to get order age in days
orderSchema.virtual('orderAge').get(function() {
  if (!this.creationDate) return 0;
  const today = new Date();
  const diffTime = today - this.creationDate;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
});

// Basic indexes for performance
orderSchema.index({ customerId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ receivedBy: 1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ creationDate: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderNumber: 1 });

// Compound indexes for common queries
orderSchema.index({ status: 1, creationDate: -1 });
orderSchema.index({ receivedBy: 1, creationDate: -1 });
orderSchema.index({ createdBy: 1, status: 1 });
orderSchema.index({ paymentStatus: 1, status: 1 });

// Static method to get status options
orderSchema.statics.getStatusOptions = function() {
  return ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
};

// Static method to get payment status options
orderSchema.statics.getPaymentStatusOptions = function() {
  return ['pending', 'paid', 'partial', 'refunded'];
};

// Static method to find recent orders
orderSchema.statics.findRecentOrders = function(days = 7) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  return this.find({
    creationDate: { $gte: startDate }
  }).sort({ creationDate: -1 });
};

// Instance method to update status
orderSchema.methods.updateStatus = function(newStatus) {
  const validStatuses = this.constructor.getStatusOptions();
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}. Valid options: ${validStatuses.join(', ')}`);
  }
  
  this.status = newStatus;
  return this.save();
};

// Instance method to update payment status
orderSchema.methods.updatePaymentStatus = function(newPaymentStatus) {
  const validPaymentStatuses = this.constructor.getPaymentStatusOptions();
  if (!validPaymentStatuses.includes(newPaymentStatus)) {
    throw new Error(`Invalid payment status: ${newPaymentStatus}. Valid options: ${validPaymentStatuses.join(', ')}`);
  }
  
  this.paymentStatus = newPaymentStatus;
  return this.save();
};

// Instance method to calculate total from items
orderSchema.methods.calculateTotal = function() {
  if (!this.items || this.items.length === 0) {
    return 0;
  }
  
  return this.items.reduce((total, item) => {
    return total + (item.quantity * item.unitPrice);
  }, 0);
};

// Instance method to check if order can be edited
orderSchema.methods.canBeEdited = function() {
  return !['completed', 'cancelled'].includes(this.status);
};

module.exports = mongoose.model('Order', orderSchema);