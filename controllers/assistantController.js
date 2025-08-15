const Customer = require('../models/Customer');
const Order = require('../models/Order');
const User = require('../models/User');

// Get assigned customers for the assistant
const getMyCustomers = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    
    const query = { assignedTo: req.user.id };
    
    // Status filtering (if you have status field)
    if (status && status !== 'all') {
      query.status = status;
    }
    
    // Basic search functionality - updated to use correct field names
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } }, // Updated from 'name'
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [customers, totalCount] = await Promise.all([
      Customer.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('fullName email phone createdAt updatedAt notes address'), // Updated field names
      Customer.countDocuments(query)
    ]);
    
    res.json({
      customers,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch customers',
      details: error.message 
    });
  }
};

// Get orders for assigned customers
const getMyOrders = async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    
    const query = { assignedTo: req.user.id };
    
    // Status filtering
    if (status && status !== 'all') {
      query.status = status;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [orders, totalCount] = await Promise.all([
      Order.find(query)
        .populate('customer', 'fullName email phone') // Updated from 'name'
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('orderNumber status totalAmount createdAt updatedAt customer'),
      Order.countDocuments(query)
    ]);
    
    res.json({
      orders,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(totalCount / parseInt(limit)),
        totalItems: totalCount,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch orders',
      details: error.message 
    });
  }
};

// Update order status within assistant's scope
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    
    // Validate status
    const validStatuses = ['pending', 'processing', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses 
      });
    }
    
    // Find order and verify it's assigned to this assistant
    const order = await Order.findOne({
      _id: id,
      assignedTo: req.user.id
    });
    
    if (!order) {
      return res.status(404).json({ 
        error: 'Order not found or not assigned to you' 
      });
    }
    
    // Update order status
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      { 
        status,
        notes: notes || order.notes,
        updatedAt: new Date()
      },
      { new: true }
    ).populate('customer', 'fullName email'); // Updated from 'name'
    
    res.json({
      message: 'Order status updated successfully',
      order: updatedOrder
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update order status',
      details: error.message 
    });
  }
};

// Get assistant's profile with basic stats
const getProfile = async (req, res) => {
  try {
    // Get user profile - updated to use correct field names
    const user = await User.findById(req.user.id)
      .select('firstName lastName email createdAt lastLogin isActive');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get basic statistics
    const [customerCount, orderCount] = await Promise.all([
      Customer.countDocuments({ assignedTo: req.user.id }),
      Order.countDocuments({ assignedTo: req.user.id })
    ]);
    
    res.json({
      profile: user,
      stats: {
        assignedCustomers: customerCount,
        totalOrders: orderCount
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch profile',
      details: error.message 
    });
  }
};

// Update assistant's profile (basic profile management)
const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, email } = req.body; // Updated to use correct field names
    
    // Basic validation
    if (!firstName || !lastName || !email) {
      return res.status(400).json({ 
        error: 'First name, last name, and email are required' 
      });
    }
    
    // Check if email is already taken by another user
    const existingUser = await User.findOne({ 
      email, 
      _id: { $ne: req.user.id } 
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        error: 'Email is already taken' 
      });
    }
    
    // Update profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { 
        firstName,
        lastName, 
        email,
        updatedAt: new Date()
      },
      { new: true }
    ).select('firstName lastName email createdAt lastLogin isActive');
    
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      message: 'Profile updated successfully',
      profile: updatedUser
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to update profile',
      details: error.message 
    });
  }
};

module.exports = {
  getMyCustomers,
  getMyOrders,
  updateOrderStatus,
  getProfile,
  updateProfile
};