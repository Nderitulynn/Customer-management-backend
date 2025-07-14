const express = require('express');
const Customer = require('../models/Customer');
const { authenticate, authorize } = require('../middleware/auth');
const router = express.Router();

// @route   GET /api/customers
// @desc    Get all customers with pagination and filters
// @access  Private (Admin sees all, Assistant sees assigned)
// @permission CUSTOMER_VIEW_ALL (admin) or CUSTOMER_VIEW_ASSIGNED (assistant)
router.get('/', authenticate, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      segment = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter object
    const filter = { isActive: true };
    
    // Role-based filtering - CUSTOMER_VIEW_ALL vs CUSTOMER_VIEW_ASSIGNED
    if (req.user.role === 'assistant') {
      filter.assignedTo = req.user._id;
    }
    
    if (search) {
      filter.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) filter.status = status;
    if (segment) filter.segment = segment;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Execute query with pagination
    const customers = await Customer.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName');

    // Get total count for pagination
    const total = await Customer.countDocuments(filter);

    res.json({
      success: true,
      data: customers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Get customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customers'
    });
  }
});

// @route   GET /api/customers/search
// @desc    Search customers with filtered results
// @access  Private (Role-based filtered search)
// @permission CUSTOMER_VIEW_ASSIGNED + filtered search
router.get('/search', authenticate, async (req, res) => {
  try {
    const { q: query, page = 1, limit = 10 } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    // Build filter object with role-based filtering
    const filter = {
      isActive: true,
      $or: [
        { fullName: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { 'address.city': { $regex: query, $options: 'i' } },
        { 'address.state': { $regex: query, $options: 'i' } }
      ]
    };

    // Role-based filtering - CUSTOMER_VIEW_ASSIGNED
    if (req.user.role === 'assistant') {
      filter.assignedTo = req.user._id;
    }

    const customers = await Customer.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName')
      .select('fullName email phone address segment status totalOrders totalSpent createdAt');

    const total = await Customer.countDocuments(filter);

    res.json({
      success: true,
      data: customers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      }
    });

  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error searching customers'
    });
  }
});

// @route   GET /api/customers/assigned
// @desc    Get customers assigned to current user (Assistant-specific)
// @access  Private (Assistant only)
// @permission CUSTOMER_VIEW_ASSIGNED (assistant-specific)
router.get('/assigned', authenticate, async (req, res) => {
  try {
    // Only assistants can access this endpoint
    if (req.user.role !== 'assistant') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. This endpoint is for assistants only.'
      });
    }

    const {
      page = 1,
      limit = 10,
      status = '',
      segment = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter for assigned customers only
    const filter = { 
      isActive: true,
      assignedTo: req.user._id
    };

    if (status) filter.status = status;
    if (segment) filter.segment = segment;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const customers = await Customer.find(filter)
      .sort(sort)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName');

    const total = await Customer.countDocuments(filter);

    // Get assignment statistics
    const assignmentStats = await Customer.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalAssigned: { $sum: 1 },
          totalSpent: { $sum: '$totalSpent' },
          totalOrders: { $sum: '$totalOrders' },
          averageSpent: { $avg: '$totalSpent' }
        }
      }
    ]);

    res.json({
      success: true,
      data: customers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total,
        limit
      },
      assignmentStats: assignmentStats[0] || {
        totalAssigned: 0,
        totalSpent: 0,
        totalOrders: 0,
        averageSpent: 0
      }
    });

  } catch (error) {
    console.error('Get assigned customers error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned customers'
    });
  }
});

// @route   GET /api/customers/stats
// @desc    Get customer statistics for dashboard
// @access  Private (Admin & Assistant)
router.get('/stats', authenticate, async (req, res) => {
  try {
    // Build base filter for role-based access
    const baseFilter = { isActive: true };
    if (req.user.role === 'assistant') {
      baseFilter.assignedTo = req.user._id;
    }

    // Get overall stats
    const stats = await Customer.getStats();
    
    // Get segment breakdown
    const segments = await Customer.getBySegment();
    
    // Get recent customers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentCustomers = await Customer.countDocuments({
      ...baseFilter,
      createdAt: { $gte: thirtyDaysAgo }
    });

    // Get top cities (filtered by role)
    const topCities = await Customer.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$address.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      success: true,
      data: {
        overview: stats,
        segments,
        recentCustomers,
        topCities
      }
    });

  } catch (error) {
    console.error('Get customer stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer statistics'
    });
  }
});

// @route   GET /api/customers/:id
// @desc    Get single customer by ID
// @access  Private (Admin & Assistant)
// @permission CUSTOMER_VIEW_ASSIGNED + resource access check
router.get('/:id', authenticate, async (req, res) => {
  try {
    // Build filter for role-based access
    const filter = { _id: req.params.id, isActive: true };
    if (req.user.role === 'assistant') {
      filter.assignedTo = req.user._id;
    }

    const customer = await Customer.findOne(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName')
      .populate('assignedTo', 'firstName lastName');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      data: customer
    });

  } catch (error) {
    console.error('Get customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching customer'
    });
  }
});

// @route   POST /api/customers
// @desc    Create new customer
// @access  Private (Admin & Assistant)
// @permission CUSTOMER_CREATE + auto-assignment logic
router.post('/', authenticate, async (req, res) => {
  try {
    const customerData = {
      ...req.body,
      createdBy: req.user._id
    };

    // Auto-assignment logic - If assistant is creating, auto-assign to themselves
    if (req.user.role === 'assistant') {
      customerData.assignedTo = req.user._id;
    }

    const customer = new Customer(customerData);
    await customer.save();

    // Populate the created customer
    await customer.populate('createdBy', 'firstName lastName');
    await customer.populate('assignedTo', 'firstName lastName');

    res.status(201).json({
      success: true,
      message: 'Customer created successfully',
      data: customer
    });

  } catch (error) {
    console.error('Create customer error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Customer with this email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating customer'
    });
  }
});

// @route   PUT /api/customers/:id
// @desc    Update customer
// @access  Private (Admin & Assistant)
// @permission CUSTOMER_UPDATE + resource access check
router.put('/:id', authenticate, async (req, res) => {
  try {
    // Build filter for role-based access
    const filter = { _id: req.params.id };
    if (req.user.role === 'assistant') {
      filter.assignedTo = req.user._id;
    }

    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user._id
    };

    const customer = await Customer.findOneAndUpdate(
      filter,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'firstName lastName')
    .populate('lastUpdatedBy', 'firstName lastName')
    .populate('assignedTo', 'firstName lastName');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: customer
    });

  } catch (error) {
    console.error('Update customer error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: messages
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error updating customer'
    });
  }
});

// @route   POST /api/customers/:id/assign
// @desc    Assign customer to assistant (Admin only)
// @access  Private (Admin only)
// @permission USER_UPDATE (admin-only)
router.post('/:id/assign', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { assignedTo } = req.body; // Can be user ID or null to unassign

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { 
        assignedTo: assignedTo || null,
        lastUpdatedBy: req.user._id
      },
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'firstName lastName')
    .populate('lastUpdatedBy', 'firstName lastName')
    .populate('assignedTo', 'firstName lastName');

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    const message = assignedTo 
      ? `Customer assigned to ${customer.assignedTo?.firstName} ${customer.assignedTo?.lastName}`
      : 'Customer unassigned';

    res.json({
      success: true,
      message,
      data: customer
    });

  } catch (error) {
    console.error('Assign customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning customer'
    });
  }
});

// @route   DELETE /api/customers/:id
// @desc    Delete customer (soft delete)
// @access  Private (Admin only)
// @permission CUSTOMER_DELETE (admin-only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { 
        isActive: false,
        lastUpdatedBy: req.user._id
      },
      { new: true }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found'
      });
    }

    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });

  } catch (error) {
    console.error('Delete customer error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting customer'
    });
  }
});

module.exports = router;