// backend/routes/customers.js
const express = require('express');
const Customer = require('../models/Customer');
const { auth, authorize } = require('../middleware/auth');
const router = express.Router();

// @route   GET /api/customers
// @desc    Get all customers with pagination and filtering
// @access  Private (Admin & Assistant)
router.get('/', auth, async (req, res) => {
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
    
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
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
      .populate('createdBy', 'firstName lastName username')
      .populate('lastUpdatedBy', 'firstName lastName username');

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

// @route   GET /api/customers/stats
// @desc    Get customer statistics for dashboard
// @access  Private (Admin & Assistant)
router.get('/stats', auth, async (req, res) => {
  try {
    // Get overall stats
    const stats = await Customer.getStats();
    
    // Get segment breakdown
    const segments = await Customer.getBySegment();
    
    // Get recent customers (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const recentCustomers = await Customer.countDocuments({
      createdAt: { $gte: thirtyDaysAgo },
      isActive: true
    });

    // Get top cities
    const topCities = await Customer.aggregate([
      { $match: { isActive: true } },
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
router.get('/:id', auth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id)
      .populate('createdBy', 'firstName lastName username')
      .populate('lastUpdatedBy', 'firstName lastName username');

    if (!customer || !customer.isActive) {
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
router.post('/', auth, async (req, res) => {
  try {
    const customerData = {
      ...req.body,
      createdBy: req.user.userId
    };

    const customer = new Customer(customerData);
    await customer.save();

    // Populate the created customer
    await customer.populate('createdBy', 'firstName lastName username');

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
router.put('/:id', auth, async (req, res) => {
  try {
    const updateData = {
      ...req.body,
      lastUpdatedBy: req.user.userId
    };

    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    )
    .populate('createdBy', 'firstName lastName username')
    .populate('lastUpdatedBy', 'firstName lastName username');

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

// @route   DELETE /api/customers/:id
// @desc    Delete customer (soft delete)
// @access  Private (Admin only)
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const customer = await Customer.findByIdAndUpdate(
      req.params.id,
      { 
        isActive: false,
        lastUpdatedBy: req.user.userId
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