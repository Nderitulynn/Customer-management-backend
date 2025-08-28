const Customer = require('../models/Customer');
const User = require('../models/User');
const Order = require('../models/Order'); // Assuming you have an Order model
const { USER_ROLES } = require('../models/User');

class CustomerService {

  /**
   * Get customers with role-based filtering
   */
  async getCustomers(query = {}, user) {
    try {
      const { search, assignedTo, unassigned, page = 1, limit = 20 } = query;
      
      // Build base query based on user role
      let baseQuery = {};
      
      if (user.role === USER_ROLES.ASSISTANT) {
        // Assistants can only see their assigned customers
        baseQuery.assignedTo = user.id;
      }
      
      // Apply filters
      if (assignedTo && user.role === USER_ROLES.ADMIN) {
        baseQuery.assignedTo = assignedTo;
      }
      
      if (unassigned === 'true' && user.role === USER_ROLES.ADMIN) {
        baseQuery.assignedTo = null;
      }
      
      // Search functionality
      if (search) {
        baseQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const customers = await Customer.find(baseQuery)
        .populate('assignedTo', 'firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      return customers;
    } catch (error) {
      throw new Error(`Failed to fetch customers: ${error.message}`);
    }
  }

  /**
   * Get customer by ID with permission check
   */
  async getCustomerById(customerId, user) {
    try {
      let query = { _id: customerId };
      
      // If assistant, ensure they can only access their assigned customers
      if (user.role === USER_ROLES.ASSISTANT) {
        query.assignedTo = user.id;
      }
      
      const customer = await Customer.findOne(query)
        .populate('assignedTo', 'firstName lastName email');
      
      return customer;
    } catch (error) {
      throw new Error(`Failed to fetch customer: ${error.message}`);
    }
  }

  /**
   * Create new customer
   */
  async createCustomer(customerData, user) {
    try {
      // If assistant is creating, auto-assign to themselves
      if (user.role === USER_ROLES.ASSISTANT) {
        customerData.assignedTo = user.id;
      }
      
      const customer = new Customer(customerData);
      await customer.save();
      
      // Populate the assignedTo field before returning
      await customer.populate('assignedTo', 'firstName lastName email');
      
      return customer;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Email already exists');
      }
      throw new Error(`Failed to create customer: ${error.message}`);
    }
  }

  /**
   * Update customer with permission check
   */
  async updateCustomer(customerId, updateData, user) {
    try {
      let query = { _id: customerId };
      
      // If assistant, ensure they can only update their assigned customers
      if (user.role === USER_ROLES.ASSISTANT) {
        query.assignedTo = user.id;
        // Assistants cannot change assignment
        delete updateData.assignedTo;
      }
      
      const customer = await Customer.findOneAndUpdate(
        query,
        updateData,
        { new: true, runValidators: true }
      ).populate('assignedTo', 'firstName lastName email');
      
      return customer;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Email already exists');
      }
      throw new Error(`Failed to update customer: ${error.message}`);
    }
  }

  /**
   * Delete customer with permission check
   */
  async deleteCustomer(customerId, user) {
    try {
      let query = { _id: customerId };
      
      // If assistant, ensure they can only delete their assigned customers
      if (user.role === USER_ROLES.ASSISTANT) {
        query.assignedTo = user.id;
      }
      
      const customer = await Customer.findOneAndDelete(query);
      return customer;
    } catch (error) {
      throw new Error(`Failed to delete customer: ${error.message}`);
    }
  }

  /**
   * Get dashboard statistics based on user role
   */
  async getDashboardStats(user) {
    try {
      let baseQuery = {};
      
      // Filter by assignment for assistants
      if (user.role === USER_ROLES.ASSISTANT) {
        baseQuery.assignedTo = user.id;
      }
      
      const [
        totalCustomers,
        assignedCustomers,
        unassignedCustomers,
        activeCustomers,
        inactiveCustomers
      ] = await Promise.all([
        Customer.countDocuments(baseQuery),
        user.role === USER_ROLES.ADMIN ? 
          Customer.countDocuments({ assignedTo: { $ne: null } }) : 
          Customer.countDocuments(baseQuery),
        user.role === USER_ROLES.ADMIN ? 
          Customer.countDocuments({ assignedTo: null }) : 
          0,
        Customer.countDocuments({ ...baseQuery, isActive: true }),
        Customer.countDocuments({ ...baseQuery, isActive: false })
      ]);
      
      return {
        totalCustomers,
        assignedCustomers,
        unassignedCustomers,
        activeCustomers,
        inactiveCustomers,
        newCustomersThisWeek: 0, // Would need date filtering
        customerGrowthPercentage: 0,
        customerSatisfaction: 0,
        customersNeedingAttention: 0
      };
    } catch (error) {
      throw new Error(`Failed to fetch dashboard stats: ${error.message}`);
    }
  }

  /**
   * Get customers by assistant
   */
  async getCustomersByAssistant(assistantId, query = {}, user) {
    try {
      // Only admins can view other assistants' customers
      if (user.role === USER_ROLES.ASSISTANT && user.id !== assistantId) {
        throw new Error('Permission denied');
      }
      
      const { search, page = 1, limit = 20 } = query;
      
      let baseQuery = { assignedTo: assistantId };
      
      // Search functionality
      if (search) {
        baseQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const customers = await Customer.find(baseQuery)
        .populate('assignedTo', 'firstName lastName email')
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      return customers;
    } catch (error) {
      throw new Error(`Failed to fetch customers by assistant: ${error.message}`);
    }
  }

  /**
   * Get unassigned customers (admin only)
   */
  async getUnassignedCustomers(query = {}, user) {
    try {
      if (user.role !== USER_ROLES.ADMIN) {
        throw new Error('Permission denied');
      }
      
      const { search, page = 1, limit = 20 } = query;
      
      let baseQuery = { assignedTo: null };
      
      // Search functionality
      if (search) {
        baseQuery.$or = [
          { fullName: { $regex: search, $options: 'i' } },
          { email: { $regex: search, $options: 'i' } },
          { phone: { $regex: search, $options: 'i' } }
        ];
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const customers = await Customer.find(baseQuery)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));
      
      return customers;
    } catch (error) {
      throw new Error(`Failed to fetch unassigned customers: ${error.message}`);
    }
  }

  /**
   * Assign customer to assistant (admin only)
   */
  async assignCustomer(customerId, assistantId, user) {
    try {
      if (user.role !== USER_ROLES.ADMIN) {
        throw new Error('Permission denied');
      }
      
      // Verify assistant exists and is active
      const assistant = await User.findOne({
        _id: assistantId,
        role: USER_ROLES.ASSISTANT,
        isActive: true
      });
      
      if (!assistant) {
        throw new Error('Assistant not found or inactive');
      }
      
      // Update customer assignment
      const customer = await Customer.findByIdAndUpdate(
        customerId,
        { assignedTo: assistantId },
        { new: true, runValidators: true }
      ).populate('assignedTo', 'firstName lastName email');
      
      if (!customer) {
        throw new Error('Customer not found');
      }
      
      return customer;
    } catch (error) {
      throw new Error(`Failed to assign customer: ${error.message}`);
    }
  }

  /**
   * Get available assistants for assignment (admin only)
   */
  async getAvailableAssistants(user) {
    try {
      if (user.role !== USER_ROLES.ADMIN) {
        throw new Error('Permission denied');
      }
      
      const assistants = await User.find({
        role: USER_ROLES.ASSISTANT,
        isActive: true
      })
      .select('firstName lastName email')
      .sort({ firstName: 1, lastName: 1 });
      
      // Get customer counts for each assistant
      const assistantsWithCounts = await Promise.all(
        assistants.map(async (assistant) => {
          const customerCount = await Customer.countDocuments({ 
            assignedTo: assistant._id 
          });
          
          return {
            ...assistant.toObject(),
            customerCount
          };
        })
      );
      
      return assistantsWithCounts;
    } catch (error) {
      throw new Error(`Failed to fetch available assistants: ${error.message}`);
    }
  }

  // ==========================================
  // CUSTOMER PORTAL SERVICE FUNCTIONS
  // ==========================================

  /**
   * Get customer dashboard data (Customer Portal)
   * Shows personal dashboard for logged-in customer
   */
  async getCustomerDashboard(customerProfileId, user) {
    try {
      // Get customer profile
      const customer = await Customer.findById(customerProfileId);
      if (!customer) {
        throw new Error('Customer profile not found');
      }

      // Get dashboard data
      const [
        totalOrders,
        pendingOrders,
        completedOrders,
        cancelledOrders,
        recentOrders
      ] = await Promise.all([
        Order.countDocuments({ customerId: customerProfileId }),
        Order.countDocuments({ customerId: customerProfileId, status: 'pending' }),
        Order.countDocuments({ customerId: customerProfileId, status: 'completed' }),
        Order.countDocuments({ customerId: customerProfileId, status: 'cancelled' }),
        Order.find({ customerId: customerProfileId })
          .sort({ createdAt: -1 })
          .limit(5)
          .select('orderNumber status totalAmount createdAt')
      ]);

      // Calculate this month's orders
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      
      const ordersThisMonth = await Order.countDocuments({
        customerId: customerProfileId,
        createdAt: { $gte: startOfMonth }
      });

      return {
        profile: {
          name: customer.fullName || customer.name,
          email: customer.email,
          phone: customer.phone,
          profileStatus: customer.isActive ? 'Active' : 'Inactive'
        },
        orderStats: {
          totalOrders,
          pendingOrders,
          completedOrders,
          cancelledOrders,
          ordersThisMonth
        },
        recentOrders,
        lastLoginDate: user.lastLogin || user.createdAt
      };

    } catch (error) {
      throw new Error(`Failed to fetch customer dashboard: ${error.message}`);
    }
  }

  /**
   * Get customer's own profile (Customer Portal)
   */
  async getCustomerProfile(customerProfileId, user) {
    try {
      const customer = await Customer.findById(customerProfileId)
        .select('-notes -assignedTo -internalComments'); // Exclude internal fields
      
      if (!customer) {
        throw new Error('Customer profile not found');
      }

      return customer;
    } catch (error) {
      throw new Error(`Failed to fetch customer profile: ${error.message}`);
    }
  }

  /**
   * Update customer's own profile (Customer Portal)
   * Only allows editing safe fields
   */
  async updateCustomerProfile(customerProfileId, updateData, user) {
    try {
      // Ensure we're only updating safe fields (additional security layer)
      const allowedFields = ['name', 'fullName', 'email', 'phone', 'address'];
      const safeUpdate = {};
      
      allowedFields.forEach(field => {
        if (updateData[field] !== undefined) {
          safeUpdate[field] = updateData[field];
        }
      });

      const customer = await Customer.findByIdAndUpdate(
        customerProfileId,
        safeUpdate,
        { new: true, runValidators: true }
      ).select('-notes -assignedTo -internalComments'); // Exclude internal fields

      if (!customer) {
        throw new Error('Customer profile not found');
      }

      return customer;
    } catch (error) {
      if (error.code === 11000) {
        throw new Error('Email already exists');
      }
      throw new Error(`Failed to update customer profile: ${error.message}`);
    }
  }

  /**
   * Get customer's own orders (Customer Portal)
   */
  async getCustomerOrders(customerProfileId, query = {}, user) {
    try {
      const { status, page = 1, limit = 20, search } = query;
      
      let baseQuery = { customerId: customerProfileId };
      
      // Filter by status if provided (this is order status, not customer status)
      if (status) {
        baseQuery.status = status;
      }

      // Search in order number or description
      if (search) {
        baseQuery.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      const orders = await Order.find(baseQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('orderNumber status totalAmount items createdAt updatedAt description');
      
      return orders;
    } catch (error) {
      throw new Error(`Failed to fetch customer orders: ${error.message}`);
    }
  }

  /**
   * Get specific order details (Customer Portal)
   * Security check: order must belong to customer
   */
  async getCustomerOrderDetails(orderId, customerProfileId, user) {
    try {
      const order = await Order.findOne({
        _id: orderId,
        customerId: customerProfileId // Security: ensure order belongs to customer
      }).populate('customerId', 'fullName email phone');
      
      if (!order) {
        throw new Error('Order not found or access denied');
      }

      return order;
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        throw new Error('Order not found or you do not have permission to view this order');
      }
      throw new Error(`Failed to fetch order details: ${error.message}`);
    }
  }

  /**
   * Create new order (Customer Portal)
   * Automatically assigns to customer's profile
   */
  async createCustomerOrder(orderData, user) {
    try {
      // Validate required fields
      if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      // Generate order number if not provided
      if (!orderData.orderNumber) {
        const orderCount = await Order.countDocuments({});
        orderData.orderNumber = `ORD-${Date.now()}-${orderCount + 1}`;
      }

      // Set default status
      if (!orderData.status) {
        orderData.status = 'pending';
      }

      // Calculate total if not provided
      if (!orderData.totalAmount && orderData.items) {
        orderData.totalAmount = orderData.items.reduce((total, item) => {
          return total + (item.price * item.quantity || 0);
        }, 0);
      }

      const order = new Order(orderData);
      await order.save();
      
      // Populate customer details
      await order.populate('customerId', 'fullName email phone');
      
      return order;
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new Error(`Validation error: ${error.message}`);
      }
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Cancel customer's own order (Customer Portal)
   * Security checks: order belongs to them AND status allows cancellation
   */
  async cancelCustomerOrder(orderId, customerProfileId, user) {
    try {
      // Find order and verify ownership
      const order = await Order.findOne({
        _id: orderId,
        customerId: customerProfileId
      });
      
      if (!order) {
        throw new Error('Order not found or access denied');
      }

      // Check if order can be cancelled
      const cancellableStatuses = ['pending', 'confirmed', 'processing'];
      if (!cancellableStatuses.includes(order.status)) {
        throw new Error(`Order cannot be cancelled. Current status: ${order.status}`);
      }

      // Update order status
      order.status = 'cancelled';
      order.cancelledAt = new Date();
      order.cancelledBy = user._id;
      order.cancellationReason = 'Cancelled by customer';
      
      await order.save();
      
      // Populate customer details
      await order.populate('customerId', 'fullName email phone');
      
      return order;
    } catch (error) {
      if (error.message.includes('not found') || error.message.includes('access denied')) {
        throw new Error('Order not found or you do not have permission to cancel this order');
      }
      if (error.message.includes('cannot be cancelled')) {
        throw error; // Re-throw status validation errors as-is
      }
      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }
}

module.exports = new CustomerService();