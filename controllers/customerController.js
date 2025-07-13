const Customer = require('../models/Customer');
const WhatsAppService = require('../services/whatsappService');
const { validateCustomer, handleValidationErrors } = require('../utils/validation');
const { USER_ROLES } = require('../models/User');

class CustomerController {
  // Create new customer
  async createCustomer(req, res) {
    try {
      const errors = validateCustomer(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      const customerData = {
        ...req.body,
        createdBy: req.user._id
      };

      // If assistant is creating, auto-assign to themselves
      if (req.user.role === USER_ROLES.ASSISTANT) {
        customerData.assignedTo = req.user._id;
      }

      const customer = new Customer(customerData);
      await customer.save();

      // Populate the created customer
      await customer.populate('createdBy', 'firstName lastName');
      await customer.populate('assignedTo', 'firstName lastName');
      
      res.status(201).json({ 
        success: true, 
        data: customer,
        message: 'Customer created successfully' 
      });
    } catch (error) {
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
        message: error.message 
      });
    }
  }

  // Get all customers with pagination, filters, and role-based filtering
  async getCustomers(req, res) {
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
      
      // Role-based filtering - Option B: Assistants see only their assigned customers
      if (req.user.role === USER_ROLES.ASSISTANT) {
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

      const customers = await Customer.find(filter)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('createdBy', 'firstName lastName')
        .populate('lastUpdatedBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName');

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
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Get customer by ID with role-based access
  async getCustomerById(req, res) {
    try {
      // Build filter for role-based access
      const filter = { _id: req.params.id, isActive: true };
      if (req.user.role === USER_ROLES.ASSISTANT) {
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
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Update customer with role-based access
  async updateCustomer(req, res) {
    try {
      const errors = validateCustomer(req.body, true);
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      // Build filter for role-based access
      const filter = { _id: req.params.id };
      if (req.user.role === USER_ROLES.ASSISTANT) {
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
        data: customer,
        message: 'Customer updated successfully' 
      });
    } catch (error) {
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
        message: error.message 
      });
    }
  }

  // Delete customer (Admin only - soft delete)
  async deleteCustomer(req, res) {
    try {
      if (req.user.role !== USER_ROLES.ADMIN) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

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
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Assign customer to assistant (Admin only)
  async assignCustomer(req, res) {
    try {
      if (req.user.role !== USER_ROLES.ADMIN) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

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
        data: customer,
        message 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Search customers with order history and role-based filtering
  async searchWithOrderHistory(req, res) {
    try {
      const { query } = req.query;
      
      const matchStage = {
        isActive: true,
        $or: [
          { fullName: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } }
        ]
      };

      // Role-based filtering - Option B: Assistants see only their assigned customers
      if (req.user.role === USER_ROLES.ASSISTANT) {
        matchStage.assignedTo = req.user._id;
      }
      
      const customers = await Customer.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'orders',
            localField: '_id',
            foreignField: 'customerId',
            as: 'orders'
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'assignedTo',
            foreignField: '_id',
            as: 'assignedUser'
          }
        },
        {
          $project: {
            fullName: 1,
            email: 1,
            phone: 1,
            assignedTo: { $arrayElemAt: ['$assignedUser', 0] },
            orderCount: { $size: '$orders' },
            totalSpent: { $sum: '$orders.total' },
            lastOrderDate: { $max: '$orders.createdAt' }
          }
        }
      ]);

      res.json({ 
        success: true, 
        data: customers 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Send WhatsApp message to customer with role-based access
  async sendWhatsAppMessage(req, res) {
    try {
      const { message } = req.body;
      
      // Build filter for role-based access
      const filter = { _id: req.params.id, isActive: true };
      if (req.user.role === USER_ROLES.ASSISTANT) {
        filter.assignedTo = req.user._id;
      }
      
      const customer = await Customer.findOne(filter);
      
      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found' 
        });
      }

      await WhatsAppService.sendMessage(customer.phone, message);
      
      res.json({ 
        success: true, 
        message: 'WhatsApp message sent successfully' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Get customer analytics with role-based filtering
  async getCustomerAnalytics(req, res) {
    try {
      const matchStage = { isActive: true };
      
      // Role-based filtering - Option B: Assistants see only their assigned customers
      if (req.user.role === USER_ROLES.ASSISTANT) {
        matchStage.assignedTo = req.user._id;
      }

      const analytics = await Customer.aggregate([
        { $match: matchStage },
        {
          $lookup: {
            from: 'orders',
            localField: '_id',
            foreignField: 'customerId',
            as: 'orders'
          }
        },
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            assignedCustomers: {
              $sum: {
                $cond: [{ $ne: ['$assignedTo', null] }, 1, 0]
              }
            },
            unassignedCustomers: {
              $sum: {
                $cond: [{ $eq: ['$assignedTo', null] }, 1, 0]
              }
            },
            activeCustomers: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$orders' }, 0] }, 1, 0]
              }
            },
            averageOrderValue: { $avg: { $avg: '$orders.total' } },
            topSpenders: {
              $push: {
                customer: { fullName: '$fullName', email: '$email' },
                totalSpent: { $sum: '$orders.total' }
              }
            }
          }
        }
      ]);

      res.json({ 
        success: true, 
        data: analytics[0] || {} 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Get customer statistics for dashboard
  async getCustomerStats(req, res) {
    try {
      // Build base filter for role-based access
      const baseFilter = { isActive: true };
      if (req.user.role === USER_ROLES.ASSISTANT) {
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
      res.status(500).json({
        success: false,
        message: 'Error fetching customer statistics'
      });
    }
  }
}

module.exports = new CustomerController();