const Order = require('../models/Order');
const Customer = require('../models/Customer');
const User = require('../models/User');
// Import the auto-generation function
const { autoGenerateInvoice } = require('./invoiceController');

// Get all orders
const getAllOrders = async (req, res) => {
  try {
    const { search, status, priority, paymentStatus, receivedBy, createdBy } = req.query;
    
    // Build filter object
    const filter = {};
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      filter.paymentStatus = paymentStatus;
    }
    
    if (receivedBy) {
      filter.receivedBy = receivedBy;
    }
    
    if (createdBy) {
      filter.createdBy = createdBy;
    }
    
    // Search functionality
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { orderNumber: searchRegex },
        { 'items.productName': searchRegex },
        { notes: searchRegex }
      ];
    }
    
    const orders = await Order.find(filter)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ 
      message: 'Error fetching orders', 
      error: error.message 
    });
  }
};

// Get orders by customer ID
const getCustomerOrders = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { status, priority, paymentStatus } = req.query;
    
    // Build filter object
    const filter = { customerId };
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (priority && priority !== 'all') {
      filter.priority = priority;
    }
    
    if (paymentStatus && paymentStatus !== 'all') {
      filter.paymentStatus = paymentStatus;
    }
    
    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    const orders = await Order.find(filter)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email')
      .sort({ createdAt: -1 });
    
    res.json(orders);
  } catch (error) {
    console.error('Error fetching customer orders:', error);
    res.status(500).json({ 
      message: 'Error fetching customer orders', 
      error: error.message 
    });
  }
};

// Get single order by ID
const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('customerId', 'fullName email phone address')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    res.json(order);
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ 
      message: 'Error fetching order', 
      error: error.message 
    });
  }
};

// Create new order with AUTOMATIC INVOICE GENERATION
const createOrder = async (req, res) => {
  try {
    const {
      customerId,
      items,
      orderTotal,
      status,
      priority,
      dueDate,
      paymentStatus,
      createdBy,
      notes
    } = req.body;
    
    // Get the user ID from auth middleware (this will be the currently logged-in assistant)
    const userId = req.user?.id || createdBy;
    
    // Validate required fields
    if (!customerId) {
      return res.status(400).json({ message: 'Customer ID is required' });
    }
    
    if (!items || items.length === 0) {
      return res.status(400).json({ message: 'Order items are required' });
    }
    
    if (!userId) {
      return res.status(400).json({ message: 'User authentication required' });
    }
    
    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      return res.status(400).json({ message: 'Customer not found' });
    }
    
    // Validate user exists (the currently logged-in assistant)
    const user = await User.findById(userId);
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }
    
    // Validate items
    for (const item of items) {
      if (!item.productName || !item.quantity || !item.unitPrice) {
        return res.status(400).json({ 
          message: 'Each item must have productName, quantity, and unitPrice' 
        });
      }
      
      if (item.quantity < 1) {
        return res.status(400).json({ 
          message: 'Item quantity must be at least 1' 
        });
      }
      
      if (item.unitPrice < 0) {
        return res.status(400).json({ 
          message: 'Item unit price cannot be negative' 
        });
      }
    }
    
    // Create order object - order goes to currently logged-in assistant
    const orderData = {
      customerId,
      items,
      orderTotal: orderTotal || 0,
      receivedBy: userId, // Order received by current logged-in assistant
      createdBy: userId,  // Also created by same assistant
      notes: notes || ''
    };
    
    // Add optional fields if provided
    if (status) orderData.status = status;
    if (priority) orderData.priority = priority;
    if (dueDate) orderData.dueDate = dueDate;
    if (paymentStatus) orderData.paymentStatus = paymentStatus;
    
    // STEP 1: Create the order
    const order = new Order(orderData);
    await order.save();
    
    console.log(`📦 Order created: ${order.orderNumber || order._id}`);
    
    // STEP 2: Populate the created order
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    // STEP 3: AUTOMATICALLY GENERATE INVOICE
    let invoiceInfo = null;
    let warning = null;
    
    try {
      console.log(`🔄 Auto-generating invoice for order ${order._id}...`);
      const invoice = await autoGenerateInvoice(order._id, userId);
      
      invoiceInfo = {
        id: invoice._id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        totalAmount: invoice.totalAmount,
        dueDate: invoice.dueDate
      };
      
      console.log(`✅ Invoice ${invoice.invoiceNumber} created successfully!`);
      
    } catch (invoiceError) {
      // Order was created successfully, but invoice generation failed
      console.error('⚠️ Order created but invoice generation failed:', invoiceError.message);
      warning = `Invoice generation failed: ${invoiceError.message}. Invoice can be created manually later.`;
    }
    
    // STEP 4: Return response with order and invoice info
    const response = {
      success: true,
      message: invoiceInfo 
        ? 'Order created successfully with invoice' 
        : 'Order created successfully',
      order: populatedOrder
    };
    
    if (invoiceInfo) {
      response.invoice = invoiceInfo;
    }
    
    if (warning) {
      response.warning = warning;
    }
    
    res.status(201).json(response);
    
  } catch (error) {
    console.error('❌ Error creating order:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        success: false,
        message: 'Validation error', 
        errors 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Error creating order', 
      error: error.message 
    });
  }
};

// Update order
const updateOrder = async (req, res) => {
  try {
    const {
      customerId,
      items,
      orderTotal,
      status,
      priority,
      dueDate,
      paymentStatus,
      receivedBy,
      notes
    } = req.body;
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Validate customer if provided
    if (customerId) {
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(400).json({ message: 'Customer not found' });
      }
      order.customerId = customerId;
    }
    
    // Validate receiving user if provided
    if (receivedBy) {
      const receivingUser = await User.findById(receivedBy);
      if (!receivingUser) {
        return res.status(400).json({ message: 'Receiving user not found' });
      }
      order.receivedBy = receivedBy;
    }
    
    // Update items if provided
    if (items) {
      // Validate items
      for (const item of items) {
        if (!item.productName || !item.quantity || !item.unitPrice) {
          return res.status(400).json({ 
            message: 'Each item must have productName, quantity, and unitPrice' 
          });
        }
        
        if (item.quantity < 1) {
          return res.status(400).json({ 
            message: 'Item quantity must be at least 1' 
          });
        }
        
        if (item.unitPrice < 0) {
          return res.status(400).json({ 
            message: 'Item unit price cannot be negative' 
          });
        }
      }
      order.items = items;
    }
    
    // Update other fields if provided
    if (orderTotal !== undefined) order.orderTotal = orderTotal;
    if (status) order.status = status;
    if (priority) order.priority = priority;
    if (dueDate !== undefined) order.dueDate = dueDate;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (notes !== undefined) order.notes = notes;
    
    await order.save();
    
    // Populate the updated order before sending response
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    res.json(populatedOrder);
  } catch (error) {
    console.error('Error updating order:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({ 
        message: 'Validation error', 
        errors 
      });
    }
    
    res.status(500).json({ 
      message: 'Error updating order', 
      error: error.message 
    });
  }
};

// All other methods remain exactly the same...
const deleteOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ 
      message: 'Error deleting order', 
      error: error.message 
    });
  }
};

// Get recent order activity
const getRecentActivity = async (req, res) => {
  try {
    const recentOrders = await Order.find()
      .populate('customerId', 'fullName')
      .populate('receivedBy', 'fullName')
      .sort({ createdAt: -1 })
      .limit(10);
    
    const activity = recentOrders.map(order => ({
      id: order._id,
      type: 'order',
      message: `Order #${order.orderNumber || order._id.toString().slice(-6)} created for ${order.customerId?.fullName || 'Unknown Customer'}`,
      timestamp: order.createdAt,
      status: order.status,
      priority: order.priority
    }));
    
    res.json(activity);
  } catch (error) {
    console.error('Error fetching recent activity:', error);
    res.status(500).json({ 
      message: 'Error fetching recent activity', 
      error: error.message 
    });
  }
};

// Get dashboard statistics (alias for getOrderStats)
const getDashboardStats = async (req, res) => {
  return getOrderStats(req, res);
};

// Get orders (alias for getAllOrders)
const getOrders = async (req, res) => {
  return getAllOrders(req, res);
};

// Get order statistics
const getOrderStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$orderTotal' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          confirmedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'confirmed'] }, 1, 0] }
          },
          inProgressOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
          },
          highPriorityOrders: {
            $sum: { $cond: [{ $eq: ['$priority', 'high'] }, 1, 0] }
          },
          paidOrders: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] }, 1, 0] }
          },
          pendingPaymentOrders: {
            $sum: { $cond: [{ $eq: ['$paymentStatus', 'pending'] }, 1, 0] }
          }
        }
      }
    ]);
    
    const result = stats[0] || {
      totalOrders: 0,
      totalValue: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      inProgressOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
      highPriorityOrders: 0,
      paidOrders: 0,
      pendingPaymentOrders: 0
    };
    
    res.json(result);
  } catch (error) {
    console.error('Error fetching order statistics:', error);
    res.status(500).json({ 
      message: 'Error fetching order statistics', 
      error: error.message 
    });
  }
};

// Get order status options
const getOrderStatusOptions = async (req, res) => {
  try {
    const statusOptions = Order.getStatusOptions().map(status => ({
      value: status,
      label: status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')
    }));
    
    res.json(statusOptions);
  } catch (error) {
    console.error('Error fetching status options:', error);
    res.status(500).json({ 
      message: 'Error fetching status options', 
      error: error.message 
    });
  }
};

// Get order priority options
const getPriorityOptions = async (req, res) => {
  try {
    const priorityOptions = Order.getPriorityOptions().map(priority => ({
      value: priority,
      label: priority.charAt(0).toUpperCase() + priority.slice(1)
    }));
    
    res.json(priorityOptions);
  } catch (error) {
    console.error('Error fetching priority options:', error);
    res.status(500).json({ 
      message: 'Error fetching priority options', 
      error: error.message 
    });
  }
};

// Get payment status options
const getPaymentStatusOptions = async (req, res) => {
  try {
    const paymentStatusOptions = Order.getPaymentStatusOptions().map(status => ({
      value: status,
      label: status.charAt(0).toUpperCase() + status.slice(1)
    }));
    
    res.json(paymentStatusOptions);
  } catch (error) {
    console.error('Error fetching payment status options:', error);
    res.status(500).json({ 
      message: 'Error fetching payment status options', 
      error: error.message 
    });
  }
};

// Update order status only
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({ message: 'Status is required' });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Use the model's updateStatus method for validation
    await order.updateStatus(status);
    
    // Populate the updated order before sending response
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    res.json(populatedOrder);
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ 
      message: 'Error updating order status', 
      error: error.message 
    });
  }
};

// Update order priority only
const updateOrderPriority = async (req, res) => {
  try {
    const { priority } = req.body;
    
    if (!priority) {
      return res.status(400).json({ message: 'Priority is required' });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Use the model's updatePriority method for validation
    await order.updatePriority(priority);
    
    // Populate the updated order before sending response
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    res.json(populatedOrder);
  } catch (error) {
    console.error('Error updating order priority:', error);
    res.status(500).json({ 
      message: 'Error updating order priority', 
      error: error.message 
    });
  }
};

// Update order payment status only
const updateOrderPaymentStatus = async (req, res) => {
  try {
    const { paymentStatus } = req.body;
    
    if (!paymentStatus) {
      return res.status(400).json({ message: 'Payment status is required' });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Use the model's updatePaymentStatus method for validation
    await order.updatePaymentStatus(paymentStatus);
    
    // Populate the updated order before sending response
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    res.json(populatedOrder);
  } catch (error) {
    console.error('Error updating order payment status:', error);
    res.status(500).json({ 
      message: 'Error updating order payment status', 
      error: error.message 
    });
  }
};

// Update order payment information
const updateOrderPayment = async (req, res) => {
  try {
    const { paymentAmount, paymentStatus, paymentMethod, paymentDate } = req.body;
    
    if (!paymentAmount && !paymentStatus) {
      return res.status(400).json({ 
        message: 'Either paymentAmount or paymentStatus is required' 
      });
    }
    
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    // Update payment fields if provided
    if (paymentAmount !== undefined) order.paymentAmount = paymentAmount;
    if (paymentStatus) order.paymentStatus = paymentStatus;
    if (paymentMethod) order.paymentMethod = paymentMethod;
    if (paymentDate !== undefined) order.paymentDate = paymentDate;
    
    await order.save();
    
    // Populate the updated order before sending response
    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'fullName email')
      .populate('createdBy', 'fullName email');
    
    res.json(populatedOrder);
  } catch (error) {
    console.error('Error updating order payment:', error);
    res.status(500).json({ 
      message: 'Error updating order payment', 
      error: error.message 
    });
  }
};

module.exports = {
  getAllOrders,
  getOrders,
  getOrderById,
  getCustomerOrders,
  createOrder, // ← This now includes auto-invoice generation!
  updateOrder,
  deleteOrder,
  getOrderStats,
  getDashboardStats,
  getRecentActivity,
  getOrderStatusOptions,
  getPriorityOptions,
  getPaymentStatusOptions,
  updateOrderStatus,
  updateOrderPriority,
  updateOrderPaymentStatus,
  updateOrderPayment
};