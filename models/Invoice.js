const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: {
    type: String,
    required: true,
    unique: true,
    default: function() {
      // Generate invoice number like INV-001, INV-002, etc.
      return `INV-${Date.now().toString().slice(-6)}`;
    }
  },
  
  // References to existing models
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true
  },
  
  // Copied data for easy access (denormalized)
  customerName: {
    type: String,
    required: true
  },
  
  customerEmail: {
    type: String,
    required: true
  },
  
  customerPhone: {
    type: String
  },
  
  // Invoice items (copied from order)
  items: [{
    productName: {
      type: String,
      required: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0
    },
    lineTotal: {
      type: Number,
      required: true,
      min: 0
    }
  }],
  
  // Financial details
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Invoice status
  status: {
    type: String,
    enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
    default: 'draft'
  },
  
  // Dates
  invoiceDate: {
    type: Date,
    default: Date.now
  },
  
  dueDate: {
    type: Date,
    required: true,
    default: function() {
      // Default due date is 30 days from invoice date
      const date = new Date();
      date.setDate(date.getDate() + 30);
      return date;
    }
  },
  
  // Optional fields
  notes: {
    type: String,
    maxlength: 500
  },
  
  paymentTerms: {
    type: String,
    default: 'Net 30 days'
  },
  
  // Status tracking
  sentAt: {
    type: Date
  },
  
  paidAt: {
    type: Date
  },
  
  // Created by assistant
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User', // Assuming you have a User model for assistants
    required: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// Pre-save middleware to calculate totals
invoiceSchema.pre('save', function(next) {
  if (this.items && this.items.length > 0) {
    // Calculate subtotal from items
    this.subtotal = this.items.reduce((sum, item) => {
      item.lineTotal = item.quantity * item.unitPrice;
      return sum + item.lineTotal;
    }, 0);
    
    // Calculate total (subtotal + tax)
    this.totalAmount = this.subtotal + this.taxAmount;
  }
  next();
});

// Instance method to check if invoice is overdue
invoiceSchema.methods.isOverdue = function() {
  return this.status !== 'paid' && this.dueDate < new Date();
};

// Static method to get invoices by status
invoiceSchema.statics.findByStatus = function(status) {
  return this.find({ status: status });
};

// Static method to get overdue invoices
invoiceSchema.statics.findOverdue = function() {
  return this.find({
    status: { $nin: ['paid', 'cancelled'] },
    dueDate: { $lt: new Date() }
  });
};

// Virtual for days until due
invoiceSchema.virtual('daysUntilDue').get(function() {
  const today = new Date();
  const dueDate = new Date(this.dueDate);
  const diffTime = dueDate - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
});

// Virtual for formatted invoice number
invoiceSchema.virtual('formattedNumber').get(function() {
  return `#${this.invoiceNumber}`;
});

// Ensure virtuals are included in JSON output
invoiceSchema.set('toJSON', { virtuals: true });
invoiceSchema.set('toObject', { virtuals: true });

const Invoice = mongoose.model('Invoice', invoiceSchema);

module.exports = Invoice;