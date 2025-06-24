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

  // Get all customers with pagination and filters
  async getCustomers(req, res) {
    try {
      const { page = 1, limit = 10, search, name, email, phone } = req.query;
      const skip = (page - 1) * limit;
      
      // Build filter object
      const filter = {};
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
        .limit(limit * 1)
        .skip(skip)
        .sort({ createdAt: -1 });

      const total = await Customer.countDocuments(filter);

      res.json({
        success: true,
        data: customers,
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

  // Get customer by ID
  async getCustomerById(req, res) {
    try {
      const customer = await Customer.findById(req.params.id).populate('orders');
      
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
        return res.status(400).json({ errors });
      }

      const customer = await Customer.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true, runValidators: true }
      );

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

  // Search customers with order history
  async searchWithOrderHistory(req, res) {
    try {
      const { query } = req.query;
      
      const customers = await Customer.aggregate([
        {
          $match: {
            $or: [
              { name: { $regex: query, $options: 'i' } },
              { email: { $regex: query, $options: 'i' } },
              { phone: { $regex: query, $options: 'i' } }
            ]
          }
        },
        {
          $lookup: {
            from: 'orders',
            localField: '_id',
            foreignField: 'customerId',
            as: 'orders'
          }
        },
        {
          $project: {
            name: 1,
            email: 1,
            phone: 1,
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

  // Send WhatsApp message to customer
  async sendWhatsAppMessage(req, res) {
    try {
      const { message } = req.body;
      const customer = await Customer.findById(req.params.id);
      
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

  // Get customer analytics
  async getCustomerAnalytics(req, res) {
    try {
      if (!checkRole(req.user, ['admin', 'manager'])) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

      const analytics = await Customer.aggregate([
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
            activeCustomers: {
              $sum: {
                $cond: [{ $gt: [{ $size: '$orders' }, 0] }, 1, 0]
              }
            },
            averageOrderValue: { $avg: { $avg: '$orders.total' } },
            topSpenders: {
              $push: {
                customer: { name: '$name', email: '$email' },
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
}

module.exports = new CustomerController();