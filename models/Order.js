const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  // Order Identification
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  
  // Customer Reference - FIXED: Changed from 'customer' to 'customerId'
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: [true, 'Customer is required']
  },

  // Order Items
  items: [{
    productName: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      default: 1
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative']
    },
    totalPrice: {
      type: Number,
      required: true,
      min: [0, 'Total price cannot be negative']
    }
  }],

  // Order Totals
  orderTotal: {
    type: Number,
    required: [true, 'Order total is required'],
    min: [0, 'Order total cannot be negative']
  },

  // Order Status and Priority
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },

  // Dates and Scheduling
  dueDate: {
    type: Date
  },

  // Order Notes
  notes: {
    type: String,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },

  // Payment Information
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid'],
    default: 'pending'
  },
  paymentAmount: {
    type: Number,
    default: 0,
    min: [0, 'Payment amount cannot be negative']
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

// Indexes for performance - FIXED: Updated index from 'customer' to 'customerId'
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customerId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ priority: 1 });
orderSchema.index({ assignedTo: 1 });
orderSchema.index({ dueDate: 1 });
orderSchema.index({ createdAt: -1 });

// Virtual for payment balance
orderSchema.virtual('paymentBalance').get(function() {
  return this.orderTotal - this.paymentAmount;
});

// Virtual for overdue status
orderSchema.virtual('isOverdue').get(function() {
  if (!this.dueDate) return false;
  return new Date() > this.dueDate && this.status !== 'completed' && this.status !== 'cancelled';
});

// Pre-save middleware to generate order number
orderSchema.pre('save', async function(next) {
  if (this.isNew) {
    try {
      // Generate order number: ORD-YYYYMMDD-XXX
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
      
      // Find the highest order number for today
      const todayOrders = await this.constructor.find({
        orderNumber: new RegExp(`^ORD-${dateStr}-`)
      }).sort({ orderNumber: -1 }).limit(1);

      let sequence = 1;
      if (todayOrders.length > 0) {
        const lastOrderNumber = todayOrders[0].orderNumber;
        const lastSequence = parseInt(lastOrderNumber.split('-')[2]);
        sequence = lastSequence + 1;
      }

      this.orderNumber = `ORD-${dateStr}-${sequence.toString().padStart(3, '0')}`;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Pre-save middleware to calculate order total
orderSchema.pre('save', function(next) {
  // Calculate item total prices
  if (this.items && this.items.length > 0) {
    this.items.forEach(item => {
      item.totalPrice = item.quantity * item.unitPrice;
    });

    // Calculate order total
    this.orderTotal = this.items.reduce((total, item) => total + item.totalPrice, 0);
  }

  // Validate payment amount doesn't exceed order total
  if (this.paymentAmount > this.orderTotal) {
    return next(new Error('Payment amount cannot exceed order total'));
  }

  next();
});

// Post-save middleware to update customer statistics - FIXED: Updated field reference
orderSchema.post('save', async function(doc, next) {
  try {
    const Customer = mongoose.model('Customer');
    const customer = await Customer.findById(doc.customerId);
    
    if (customer) {
      // Get all orders for this customer - FIXED: Updated field reference
      const Order = mongoose.model('Order');
      const customerOrders = await Order.find({ 
        customerId: doc.customerId,
        status: { $ne: 'cancelled' }
      });

      // Calculate totals
      const totalOrders = customerOrders.length;
      const totalSpent = customerOrders
        .filter(order => order.status === 'completed')
        .reduce((sum, order) => sum + order.orderTotal, 0);

      // Find last order date (completed orders only)
      const completedOrders = customerOrders.filter(order => order.status === 'completed');
      let lastOrderDate = null;
      if (completedOrders.length > 0) {
        lastOrderDate = completedOrders
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]
          .createdAt;
      }

      // Update customer
      await Customer.findByIdAndUpdate(doc.customerId, {
        totalOrders,
        totalSpent,
        lastOrderDate
      });
    }
  } catch (error) {
    console.error('Error updating customer statistics:', error);
  }
  next();
});

// Static method for order analytics
orderSchema.statics.getOrderStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$orderTotal' },
        averageOrderValue: { $avg: '$orderTotal' },
        pendingOrders: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
        completedOrders: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } }
      }
    }
  ]);

  const statusStats = await this.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 }, revenue: { $sum: '$orderTotal' } } }
  ]);

  return {
    overview: stats[0] || {
      totalOrders: 0,
      totalRevenue: 0,
      averageOrderValue: 0,
      pendingOrders: 0,
      completedOrders: 0
    },
    byStatus: statusStats.reduce((acc, stat) => {
      acc[stat._id] = { count: stat.count, revenue: stat.revenue };
      return acc;
    }, {})
  };
};

// Instance methods
orderSchema.methods.updatePayment = function(amount) {
  this.paymentAmount += amount;
  if (this.paymentAmount >= this.orderTotal) {
    this.paymentStatus = 'paid';
  } else if (this.paymentAmount > 0) {
    this.paymentStatus = 'partial';
  }
  return this.save();
};

orderSchema.methods.updateStatus = function(newStatus) {
  this.status = newStatus;
  return this.save();
};

module.exports = mongoose.model('Order', orderSchema);