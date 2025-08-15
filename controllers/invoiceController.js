const Invoice = require('../models/Invoice');
const Order = require('../models/Order');
const Customer = require('../models/Customer');

// AUTO-GENERATE INVOICE FUNCTION - NEW!
const autoGenerateInvoice = async (orderId, assistantId) => {
  try {
    // Check if invoice already exists for this order
    const existingInvoice = await Invoice.findOne({ orderId });
    if (existingInvoice) {
      console.log(`Invoice already exists for order ${orderId}`);
      return existingInvoice;
    }
    
    // Get order with customer data
    const order = await Order.findById(orderId).populate('customerId');
    if (!order) {
      throw new Error('Order not found');
    }
    
    // Prepare invoice data from order
    const invoiceData = {
      customerId: order.customerId._id,
      orderId: order._id,
      customerName: order.customerId.fullName,
      customerEmail: order.customerId.email,
      customerPhone: order.customerId.phone || '',
      items: order.items.map(item => ({
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice || (item.lineTotal / item.quantity),
        lineTotal: item.lineTotal
      })),
      subtotal: order.orderTotal,
      taxAmount: 0, // Add tax calculation if needed
      totalAmount: order.orderTotal,
      createdBy: assistantId,
      status: 'draft', // Start as draft
      notes: `Auto-generated from order ${order.orderNumber || order._id}`
    };
    
    // Create the invoice
    const invoice = new Invoice(invoiceData);
    await invoice.save();
    
    console.log(`✅ Auto-generated invoice ${invoice.invoiceNumber} for order ${order.orderNumber || order._id}`);
    
    return invoice;
    
  } catch (error) {
    console.error('❌ Auto-invoice generation failed:', error.message);
    throw error;
  }
};

// Get all invoices with optional filtering
const getAllInvoices = async (req, res) => {
  try {
    const { search, status, page = 1, limit = 10 } = req.query;
    
    // Build query object
    let query = {};
    
    // Add search functionality
    if (search) {
      query.$or = [
        { invoiceNumber: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { customerEmail: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Add status filter
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Execute query with pagination
    const invoices = await Invoice.find(query)
      .populate('customerId', 'fullName email phone')
      .populate('orderId', 'orderNumber')
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    
    // Get total count for pagination
    const total = await Invoice.countDocuments(query);
    
    res.json({
      invoices,
      currentPage: parseInt(page),
      totalPages: Math.ceil(total / limit),
      totalInvoices: total
    });
    
  } catch (error) {
    console.error('Error fetching invoices:', error);
    res.status(500).json({ 
      message: 'Error fetching invoices', 
      error: error.message 
    });
  }
};

// Get single invoice by ID
const getInvoiceById = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id)
      .populate('customerId', 'fullName email phone')
      .populate('orderId', 'orderNumber items');
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json(invoice);
    
  } catch (error) {
    console.error('Error fetching invoice:', error);
    res.status(500).json({ 
      message: 'Error fetching invoice', 
      error: error.message 
    });
  }
};

// Create new invoice from order
const createInvoiceFromOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const assistantId = req.user.id; // Assuming you have auth middleware
    
    // Find the order
    const order = await Order.findById(orderId).populate('customerId');
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Check if invoice already exists for this order
    const existingInvoice = await Invoice.findOne({ orderId: orderId });
    if (existingInvoice) {
      return res.status(400).json({ message: 'Invoice already exists for this order' });
    }
    
    // Prepare invoice data from order
    const invoiceData = {
      customerId: order.customerId._id,
      orderId: order._id,
      customerName: order.customerId.fullName,
      customerEmail: order.customerId.email,
      customerPhone: order.customerId.phone,
    items: order.items.map(item => ({
  productName: item.productName,
  quantity: item.quantity,
  unitPrice: item.unitPrice || 0,
  lineTotal: item.quantity * (item.unitPrice || 0)  // <-- CALCULATE IT!
})),

      subtotal: order.orderTotal,
      taxAmount: 0, // You can calculate tax if needed
      totalAmount: order.orderTotal,
      createdBy: assistantId,
      notes: req.body.notes || ''
    };
    
    // Create the invoice
    const invoice = new Invoice(invoiceData);
    await invoice.save();
    
    // Populate the response
    await invoice.populate('customerId', 'fullName email phone');
    
    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    });
    
  } catch (error) {
    console.error('Error creating invoice from order:', error);
    res.status(500).json({ 
      message: 'Error creating invoice', 
      error: error.message 
    });
  }
};

// Create manual invoice
const createInvoice = async (req, res) => {
  try {
    const assistantId = req.user.id;
    
    const invoiceData = {
      ...req.body,
      createdBy: assistantId
    };
    
    const invoice = new Invoice(invoiceData);
    await invoice.save();
    
    // Populate the response
    await invoice.populate('customerId', 'fullName email phone');
    
    res.status(201).json({
      message: 'Invoice created successfully',
      invoice
    });
    
  } catch (error) {
    console.error('Error creating invoice:', error);
    res.status(500).json({ 
      message: 'Error creating invoice', 
      error: error.message 
    });
  }
};

// Update invoice
const updateInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    const invoice = await Invoice.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('customerId', 'fullName email phone');
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json({
      message: 'Invoice updated successfully',
      invoice
    });
    
  } catch (error) {
    console.error('Error updating invoice:', error);
    res.status(500).json({ 
      message: 'Error updating invoice', 
      error: error.message 
    });
  }
};

// Update invoice status
const updateInvoiceStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updateData = { status };
    
    // Add timestamp for specific status changes
    if (status === 'sent') {
      updateData.sentAt = new Date();
    } else if (status === 'paid') {
      updateData.paidAt = new Date();
    }
    
    const invoice = await Invoice.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('customerId', 'fullName email phone');
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json({
      message: `Invoice status updated to ${status}`,
      invoice
    });
    
  } catch (error) {
    console.error('Error updating invoice status:', error);
    res.status(500).json({ 
      message: 'Error updating invoice status', 
      error: error.message 
    });
  }
};

// Delete invoice
const deleteInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    
    const invoice = await Invoice.findByIdAndDelete(id);
    
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' });
    }
    
    res.json({ message: 'Invoice deleted successfully' });
    
  } catch (error) {
    console.error('Error deleting invoice:', error);
    res.status(500).json({ 
      message: 'Error deleting invoice', 
      error: error.message 
    });
  }
};

// Get invoice statistics
const getInvoiceStats = async (req, res) => {
  try {
    const assistantId = req.user.id;
    
    // Get all invoices for this assistant
    const allInvoices = await Invoice.find({ createdBy: assistantId });
    
    // Calculate statistics
    const stats = {
      total: allInvoices.length,
      draft: allInvoices.filter(inv => inv.status === 'draft').length,
      sent: allInvoices.filter(inv => inv.status === 'sent').length,
      paid: allInvoices.filter(inv => inv.status === 'paid').length,
      overdue: allInvoices.filter(inv => inv.isOverdue()).length,
      totalAmount: allInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0),
      paidAmount: allInvoices
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.totalAmount, 0),
      pendingAmount: allInvoices
        .filter(inv => inv.status !== 'paid' && inv.status !== 'cancelled')
        .reduce((sum, inv) => sum + inv.totalAmount, 0)
    };
    
    res.json(stats);
    
  } catch (error) {
    console.error('Error getting invoice stats:', error);
    res.status(500).json({ 
      message: 'Error getting invoice statistics', 
      error: error.message 
    });
  }
};

// Export all functions including the new autoGenerateInvoice
module.exports = {
  getAllInvoices,
  getInvoiceById,
  createInvoiceFromOrder,
  createInvoice,
  updateInvoice,
  updateInvoiceStatus,
  deleteInvoice,
  getInvoiceStats,
  autoGenerateInvoice // NEW! Export this for use in order controller
};