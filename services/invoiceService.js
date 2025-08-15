const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

class InvoiceService {
  
  // Generate unique invoice number
  static async generateInvoiceNumber() {
    try {
      const lastInvoice = await Invoice.findOne().sort({ createdAt: -1 });
      
      if (!lastInvoice) {
        return 'INV-001';
      }
      
      // Extract number from last invoice
      const lastNumber = parseInt(lastInvoice.invoiceNumber.split('-')[1]);
      const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
      
      return `INV-${nextNumber}`;
    } catch (error) {
      // Fallback to timestamp-based number
      return `INV-${Date.now().toString().slice(-6)}`;
    }
  }
  
  // Validate invoice data
  static validateInvoiceData(invoiceData) {
    const errors = [];
    
    if (!invoiceData.customerId) {
      errors.push('Customer ID is required');
    }
    
    if (!invoiceData.items || invoiceData.items.length === 0) {
      errors.push('Invoice must have at least one item');
    }
    
    if (invoiceData.items) {
      invoiceData.items.forEach((item, index) => {
        if (!item.productName) {
          errors.push(`Item ${index + 1}: Product name is required`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item ${index + 1}: Valid quantity is required`);
        }
        if (!item.unitPrice || item.unitPrice < 0) {
          errors.push(`Item ${index + 1}: Valid unit price is required`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  // Calculate invoice totals
  static calculateTotals(items, taxRate = 0) {
    if (!items || items.length === 0) {
      return {
        subtotal: 0,
        taxAmount: 0,
        totalAmount: 0
      };
    }
    
    const subtotal = items.reduce((sum, item) => {
      const lineTotal = item.quantity * item.unitPrice;
      return sum + lineTotal;
    }, 0);
    
    const taxAmount = subtotal * (taxRate / 100);
    const totalAmount = subtotal + taxAmount;
    
    return {
      subtotal: Math.round(subtotal * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100
    };
  }
  
  // Create invoice from order data
  static async createInvoiceFromOrder(orderId, assistantId, additionalData = {}) {
    try {
      // Find the order with customer data
      const order = await Order.findById(orderId).populate('customerId');
      
      if (!order) {
        throw new Error('Order not found');
      }
      
      // Check if invoice already exists
      const existingInvoice = await Invoice.findOne({ orderId: orderId });
      if (existingInvoice) {
        throw new Error('Invoice already exists for this order');
      }
      
      // Generate invoice number
      const invoiceNumber = await this.generateInvoiceNumber();
      
      // Prepare invoice items from order
      const items = order.items.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice || (item.lineTotal / item.quantity) || 0,
        lineTotal: item.lineTotal || (item.quantity * (item.unitPrice || 0))
      }));
      
      // Calculate totals
      const totals = this.calculateTotals(items);
      
      // Create invoice data
      const invoiceData = {
        invoiceNumber,
        customerId: order.customerId._id,
        orderId: order._id,
        customerName: order.customerId.fullName,
        customerEmail: order.customerId.email,
        customerPhone: order.customerId.phone,
        items,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        totalAmount: totals.totalAmount,
        createdBy: assistantId,
        ...additionalData
      };
      
      // Validate data
      const validation = this.validateInvoiceData(invoiceData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }
      
      // Create and save invoice
      const invoice = new Invoice(invoiceData);
      await invoice.save();
      
      return invoice;
      
    } catch (error) {
      throw new Error(`Failed to create invoice from order: ${error.message}`);
    }
  }
  
  // Update invoice status with proper timestamps
  static async updateInvoiceStatus(invoiceId, newStatus, userId) {
    try {
      const validStatuses = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];
      
      if (!validStatuses.includes(newStatus)) {
        throw new Error('Invalid status');
      }
      
      const updateData = { status: newStatus };
      
      // Add timestamps for specific status changes
      switch (newStatus) {
        case 'sent':
          updateData.sentAt = new Date();
          break;
        case 'paid':
          updateData.paidAt = new Date();
          break;
      }
      
      const invoice = await Invoice.findByIdAndUpdate(
        invoiceId,
        updateData,
        { new: true, runValidators: true }
      ).populate('customerId', 'fullName email phone');
      
      if (!invoice) {
        throw new Error('Invoice not found');
      }
      
      return invoice;
      
    } catch (error) {
      throw new Error(`Failed to update invoice status: ${error.message}`);
    }
  }
  
  // Get overdue invoices
  static async getOverdueInvoices(assistantId = null) {
    try {
      let query = {
        status: { $nin: ['paid', 'cancelled'] },
        dueDate: { $lt: new Date() }
      };
      
      if (assistantId) {
        query.createdBy = assistantId;
      }
      
      const overdueInvoices = await Invoice.find(query)
        .populate('customerId', 'fullName email phone')
        .sort({ dueDate: 1 });
      
      return overdueInvoices;
      
    } catch (error) {
      throw new Error(`Failed to fetch overdue invoices: ${error.message}`);
    }
  }
  
  // Calculate invoice statistics
  static async calculateInvoiceStats(assistantId = null) {
    try {
      let query = {};
      if (assistantId) {
        query.createdBy = assistantId;
      }
      
      const invoices = await Invoice.find(query);
      
      const stats = {
        total: invoices.length,
        draft: 0,
        sent: 0,
        paid: 0,
        overdue: 0,
        cancelled: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        overdueAmount: 0
      };
      
      const currentDate = new Date();
      
      invoices.forEach(invoice => {
        // Count by status
        stats[invoice.status] = (stats[invoice.status] || 0) + 1;
        
        // Check if overdue
        if (invoice.status !== 'paid' && invoice.status !== 'cancelled' && invoice.dueDate < currentDate) {
          stats.overdue++;
          stats.overdueAmount += invoice.totalAmount;
        }
        
        // Amount calculations
        stats.totalAmount += invoice.totalAmount;
        
        if (invoice.status === 'paid') {
          stats.paidAmount += invoice.totalAmount;
        } else if (invoice.status !== 'cancelled') {
          stats.pendingAmount += invoice.totalAmount;
        }
      });
      
      // Round amounts to 2 decimal places
      Object.keys(stats).forEach(key => {
        if (key.includes('Amount')) {
          stats[key] = Math.round(stats[key] * 100) / 100;
        }
      });
      
      return stats;
      
    } catch (error) {
      throw new Error(`Failed to calculate invoice statistics: ${error.message}`);
    }
  }
  
  // Search invoices with advanced filters
  static async searchInvoices(filters = {}) {
    try {
      const {
        search,
        status,
        customerId,
        dateFrom,
        dateTo,
        amountFrom,
        amountTo,
        assistantId,
        page = 1,
        limit = 10
      } = filters;
      
      let query = {};
      
      // Text search
      if (search) {
        query.$or = [
          { invoiceNumber: { $regex: search, $options: 'i' } },
          { customerName: { $regex: search, $options: 'i' } },
          { customerEmail: { $regex: search, $options: 'i' } }
        ];
      }
      
      // Status filter
      if (status && status !== 'all') {
        query.status = status;
      }
      
      // Customer filter
      if (customerId) {
        query.customerId = customerId;
      }
      
      // Date range filter
      if (dateFrom || dateTo) {
        query.invoiceDate = {};
        if (dateFrom) query.invoiceDate.$gte = new Date(dateFrom);
        if (dateTo) query.invoiceDate.$lte = new Date(dateTo);
      }
      
      // Amount range filter
      if (amountFrom || amountTo) {
        query.totalAmount = {};
        if (amountFrom) query.totalAmount.$gte = parseFloat(amountFrom);
        if (amountTo) query.totalAmount.$lte = parseFloat(amountTo);
      }
      
      // Assistant filter
      if (assistantId) {
        query.createdBy = assistantId;
      }
      
      const invoices = await Invoice.find(query)
        .populate('customerId', 'fullName email phone')
        .populate('orderId', 'orderNumber')
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await Invoice.countDocuments(query);
      
      return {
        invoices,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalInvoices: total,
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      };
      
    } catch (error) {
      throw new Error(`Failed to search invoices: ${error.message}`);
    }
  }
}

module.exports = InvoiceService;