const Customer = require('../models/Customer');
const { validateCustomer } = require('../utils/validation');
const { USER_ROLES } = require('../models/User');

class CustomerController {
  // Create new customer
  async createCustomer(req, res) {
    try {
      const errors = validateCustomer(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ 
          success: false, 
          errors 
        });
      }

      const customerData = {
        ...req.body,
        createdBy: req.user._id
      };

      // If assistant is creating, auto-assign to themselves
      if (req.user.role === USER_ROLES.ASSISTANT) {
        customerData.assignedTo = req.user._id;
        customerData.lastAssignmentDate = new Date();
      }

      const customer = new Customer(customerData);
      await customer.save();

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

  // Get all customers with basic pagination and search
  async getCustomers(req, res) {
    try {
      const { 
        page = 1, 
        limit = 10, 
        search = '', 
        status = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      const filter = { isActive: true };
      
      // Assistants can only see their assigned customers
      if (req.user.role === USER_ROLES.ASSISTANT) {
        filter.assignedTo = req.user._id;
      }
      
      // Basic search functionality
      if (search) {
        filter.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (status) filter.status = status;

      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const customers = await Customer.find(filter)
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('createdBy', 'firstName lastName')
        .populate('assignedTo', 'firstName lastName');

      const total = await Customer.countDocuments(filter);

      res.json({
        success: true,
        data: customers,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Get customer by ID
  async getCustomerById(req, res) {
    try {
      const filter = { _id: req.params.id, isActive: true };
      
      // Assistants can only see their assigned customers
      if (req.user.role === USER_ROLES.ASSISTANT) {
        filter.assignedTo = req.user._id;
      }
      
      const customer = await Customer.findOne(filter)
        .populate('createdBy', 'firstName lastName')
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

  // Update customer
  async updateCustomer(req, res) {
    try {
      const errors = validateCustomer(req.body, true);
      if (errors.length > 0) {
        return res.status(400).json({ 
          success: false, 
          errors 
        });
      }

      const filter = { _id: req.params.id, isActive: true };
      
      // Assistants can only update their assigned customers
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
          message: 'Access denied. Only admins can delete customers.' 
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

  // Claim customer (Assistant can claim unassigned customers)
  async claimCustomer(req, res) {
    try {
      const customerId = req.params.id;
      const userId = req.user._id;

      const customer = await Customer.findOne({ _id: customerId, isActive: true });
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Check if customer is already assigned
      if (customer.assignedTo) {
        return res.status(400).json({
          success: false,
          message: 'Customer is already assigned to another assistant'
        });
      }

      // Update customer assignment
      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        {
          assignedTo: userId,
          lastAssignmentDate: new Date(),
          lastUpdatedBy: userId
        },
        { new: true, runValidators: true }
      )
      .populate('assignedTo', 'firstName lastName');

      res.json({
        success: true,
        data: updatedCustomer,
        message: 'Customer claimed successfully'
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
          message: 'Access denied. Only admins can assign customers.' 
        });
      }

      const { assignedTo } = req.body;
      const customerId = req.params.id;

      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found' 
        });
      }

      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        { 
          assignedTo: assignedTo || null,
          lastAssignmentDate: assignedTo ? new Date() : null,
          lastUpdatedBy: req.user._id
        },
        { new: true, runValidators: true }
      )
      .populate('assignedTo', 'firstName lastName');

      const message = assignedTo 
        ? `Customer assigned to ${updatedCustomer.assignedTo?.firstName} ${updatedCustomer.assignedTo?.lastName}`
        : 'Customer unassigned';

      res.json({ 
        success: true, 
        data: updatedCustomer,
        message 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Get basic dashboard statistics
  async getDashboardStats(req, res) {
    try {
      const baseFilter = { isActive: true };
      
      // Assistants only see their own stats
      if (req.user.role === USER_ROLES.ASSISTANT) {
        baseFilter.assignedTo = req.user._id;
      }

      // Total customers
      const totalCustomers = await Customer.countDocuments(baseFilter);

      // Active customers
      const activeCustomers = await Customer.countDocuments({
        ...baseFilter,
        status: 'active'
      });

      // Recent customers (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentCustomers = await Customer.countDocuments({
        ...baseFilter,
        createdAt: { $gte: sevenDaysAgo }
      });

      // Unassigned customers (Admin only)
      let unassignedCustomers = 0;
      if (req.user.role === USER_ROLES.ADMIN) {
        unassignedCustomers = await Customer.countDocuments({
          isActive: true,
          assignedTo: { $exists: false }
        });
      }

      res.json({
        success: true,
        data: {
          totalCustomers,
          activeCustomers,
          recentCustomers,
          unassignedCustomers
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Error fetching dashboard statistics'
      });
    }
  }

  // Get recent customers for dashboard
  async getRecentCustomers(req, res) {
    try {
      const { limit = 10 } = req.query;
      const filter = { isActive: true };
      
      // Assistants only see their assigned customers
      if (req.user.role === USER_ROLES.ASSISTANT) {
        filter.assignedTo = req.user._id;
      }

      const customers = await Customer.find(filter)
        .sort({ createdAt: -1 })
        .limit(parseInt(limit))
        .populate('assignedTo', 'firstName lastName')
        .select('fullName email phone status createdAt');

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
}

module.exports = new CustomerController();