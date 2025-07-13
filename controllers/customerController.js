const Customer = require('../models/Customer');
const WhatsAppService = require('../services/whatsappService');
const { validateCustomer, handleValidationErrors } = require('../utils/validation');
const { checkRole } = require('../middleware/auth');

class CustomerController {
  // Create new customer
  async createCustomer(req, res) {
    try {
      const errors = validateCustomer(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ errors });
      }

      const customer = new Customer(req.body);
      await customer.save();
      
      res.status(201).json({ 
        success: true, 
        data: customer,
        message: 'Customer created successfully' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Get all customers with pagination, filters, and role-based filtering
  async getCustomers(req, res) {
    try {
      const { page = 1, limit = 10, search, name, email, phone, assignedTo } = req.query;
      const skip = (page - 1) * limit;
      
      // Build filter object
      const filter = {};
      
      // Role-based filtering
      if (checkRole(req.user, 'admin')) {
        // Admin can see all customers
        if (assignedTo) filter.assignedTo = assignedTo;
      } else {
        // Assistants can only see unassigned customers
        filter.$or = [
          { assignedTo: { $exists: false } },
          { assignedTo: null }
        ];
      }
      
      if (search) {
        filter.$or = [
          { name: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }
      if (name) filter.name = { $regex: name, $options: 'i' };
      if (email) filter.email = { $regex: email, $options: 'i' };
      if (phone) filter.phone = { $regex: phone, $options: 'i' };

      const customers = await Customer.find(filter)
        .select('-__v')
        .populate('assignedTo', 'name email')
        .limit(limit * 1)
        .skip(skip)
        .sort({ createdAt: -1 });

      const total = await Customer.countDocuments(filter);

      res.json({
        success: true,
        data: customers.map(customer => ({
          ...customer.toObject(),
          assignmentStatus: customer.assignedTo ? 'assigned' : 'unassigned'
        })),
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total
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
      const filter = { _id: req.params.id };
      
      // Role-based filtering
      if (!checkRole(req.user, 'admin')) {
        // Assistants can only see unassigned customers
        filter.$or = [
          { assignedTo: { $exists: false } },
          { assignedTo: null }
        ];
      }
      
      const customer = await Customer.findOne(filter)
        .populate('orders')
        .populate('assignedTo', 'name email');
      
      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found or access denied' 
        });
      }

      res.json({ 
        success: true, 
        data: {
          ...customer.toObject(),
          assignmentStatus: customer.assignedTo ? 'assigned' : 'unassigned'
        }
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

      const filter = { _id: req.params.id };
      
      // Role-based filtering
      if (!checkRole(req.user, 'admin')) {
        // Assistants can only update unassigned customers
        filter.$or = [
          { assignedTo: { $exists: false } },
          { assignedTo: null }
        ];
      }

      const customer = await Customer.findOneAndUpdate(
        filter,
        req.body,
        { new: true, runValidators: true }
      ).populate('assignedTo', 'name email');

      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found or access denied' 
        });
      }

      res.json({ 
        success: true, 
        data: {
          ...customer.toObject(),
          assignmentStatus: customer.assignedTo ? 'assigned' : 'unassigned'
        },
        message: 'Customer updated successfully' 
      });
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  // Delete customer (Admin only)
  async deleteCustomer(req, res) {
    try {
      if (!checkRole(req.user, 'admin')) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

      const customer = await Customer.findByIdAndDelete(req.params.id);
      
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

  // Assign customer to user (Admin and Manager only)
  async assignCustomer(req, res) {
    try {
      if (!checkRole(req.user, 'admin')) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

      const { assignedTo } = req.body;
      
      if (!assignedTo) {
        return res.status(400).json({ 
          success: false, 
          message: 'assignedTo field is required' 
        });
      }

      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        { 
          assignedTo,
          assignedAt: new Date(),
          assignedBy: req.user._id
        },
        { new: true, runValidators: true }
      ).populate('assignedTo', 'name email')
       .populate('assignedBy', 'name email');

      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found' 
        });
      }

      res.json({ 
        success: true, 
        data: {
          ...customer.toObject(),
          assignmentStatus: 'assigned'
        },
        message: 'Customer assigned successfully' 
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
        $or: [
          { name: { $regex: query, $options: 'i' } },
          { email: { $regex: query, $options: 'i' } },
          { phone: { $regex: query, $options: 'i' } }
        ]
      };

      // Role-based filtering
      if (!checkRole(req.user, 'admin')) {
        // Assistants can only search unassigned customers
        matchStage.$and = [
          {
            $or: [
              { assignedTo: { $exists: false } },
              { assignedTo: null }
            ]
          }
        ];
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
            name: 1,
            email: 1,
            phone: 1,
            assignedTo: { $arrayElemAt: ['$assignedUser', 0] },
            assignmentStatus: {
              $cond: [
                { $gt: [{ $size: '$assignedUser' }, 0] },
                'assigned',
                'unassigned'
              ]
            },
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
      const filter = { _id: req.params.id };
      
      // Role-based filtering
      if (!checkRole(req.user, 'admin')) {
        // Assistants can only message unassigned customers
        filter.$or = [
          { assignedTo: { $exists: false } },
          { assignedTo: null }
        ];
      }
      
      const customer = await Customer.findOne(filter);
      
      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found or access denied' 
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
      if (!checkRole(req.user, 'admin')) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

      const matchStage = {};
      
      // Role-based filtering for analytics
      if (!checkRole(req.user, 'admin')) {
        // Assistants can only see analytics for unassigned customers
        matchStage.$or = [
          { assignedTo: { $exists: false } },
          { assignedTo: null }
        ];
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
                customer: { name: '$name', email: '$email' },
                totalSpent: { $sum: '$orders.total' },
                assignmentStatus: {
                  $cond: [{ $ne: ['$assignedTo', null] }, 'assigned', 'unassigned']
                }
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
}

module.exports = new CustomerController();