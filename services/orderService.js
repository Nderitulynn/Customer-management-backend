const Order = require('../models/Order');
const Customer = require('../models/Customer');

class OrderService {

  /**
   * Get all orders with optional search and filtering
   */
  async getOrders(query, user) {
    try {
      console.log('🔍 Getting orders...');
      
      const { search = '', status = '', customerId = '' } = query;
      const filter = {};
      
      // Add search if provided
      if (search && search.trim()) {
        filter.$or = [
          { notes: { $regex: search.trim(), $options: 'i' } },
          { orderNumber: { $regex: search.trim(), $options: 'i' } },
          { 'items.productName': { $regex: search.trim(), $options: 'i' } }
        ];
      }

      // Add status filter
      if (status) {
        filter.status = status;
      }

      // Add customer filter
      if (customerId) {
        filter.customerId = customerId;
      }

      // Role-based filtering - assistants only see their orders
      if (user.role === 'assistant') {
        filter.receivedBy = user._id;
      }

      // Get all orders (no pagination for simplicity)
      const orders = await Order.find(filter)
        .populate('customerId', 'fullName email phone')
        .populate('receivedBy', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort({ creationDate: -1 }) // Most recent first
        .lean();

      console.log(`✅ Found ${orders.length} orders`);
      return orders;

    } catch (error) {
      console.error('❌ Error getting orders:', error);
      throw error;
    }
  }

  /**
   * Get order by ID
   */
  async getOrderById(id, user) {
    try {
      const order = await Order.findOne({
        _id: id
      })
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email');

      if (!order) {
        throw new Error('Order not found');
      }

      // Role-based access - assistants can only see their orders
      if (user.role === 'assistant' && order.receivedBy._id.toString() !== user._id.toString()) {
        throw new Error('Order not found');
      }

      return order;
    } catch (error) {
      console.error('❌ Error getting order:', error);
      throw error;
    }
  }

  /**
   * Create new order
   */
  async createOrder(orderData, user) {
    try {
      console.log('🔍 Creating order...');

      // Validate customer exists
      const customer = await Customer.findOne({
        _id: orderData.customerId,
        deletedAt: { $exists: false }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      // Set automatic receipt by currently logged-in assistant
      let receivedBy = null;
      let receivedAt = null;
      
      if (user.role === 'assistant') {
        receivedBy = user._id;
        receivedAt = new Date();
      }

      // Create order
      const order = new Order({
        ...orderData,
        receivedBy: receivedBy,
        receivedAt: receivedAt,
        createdBy: user._id,
        status: orderData.status || 'pending',
        paymentStatus: orderData.paymentStatus || 'pending'
      });

      await order.save();
      await order.populate('customerId', 'fullName email phone');
      await order.populate('receivedBy', 'firstName lastName email');
      await order.populate('createdBy', 'firstName lastName email');

      console.log('✅ Order created successfully');
      return order;

    } catch (error) {
      console.error('❌ Error creating order:', error);
      
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        throw new Error(`Validation failed: ${validationErrors.join(', ')}`);
      }
      
      throw error;
    }
  }

  /**
   * Update order
   */
  async updateOrder(id, updateData, user) {
    try {
      console.log('🔍 Updating order...');

      // Check if order exists and user has access
      const existingOrder = await this.getOrderById(id, user);

      // Validate customer if being updated
      if (updateData.customerId) {
        const customer = await Customer.findOne({
          _id: updateData.customerId,
          deletedAt: { $exists: false }
        });

        if (!customer) {
          throw new Error('Customer not found');
        }
      }

      // Only admins can transfer orders to other assistants
      if (updateData.receivedBy && user.role !== 'admin') {
        delete updateData.receivedBy;
      }

      const order = await Order.findOneAndUpdate(
        { _id: id },
        { 
          ...updateData, 
          updatedAt: new Date()
        },
        { new: true }
      )
      .populate('customerId', 'fullName email phone')
      .populate('receivedBy', 'firstName lastName email')
      .populate('createdBy', 'firstName lastName email');

      if (!order) {
        throw new Error('Order not found');
      }

      console.log('✅ Order updated successfully');
      return order;

    } catch (error) {
      console.error('❌ Error updating order:', error);
      throw error;
    }
  }

  /**
   * Delete order (soft delete)
   */
  async deleteOrder(id, user) {
    try {
      console.log('🔍 Deleting order...');

      // Check if order exists and user has access
      await this.getOrderById(id, user);

      const order = await Order.findOneAndDelete({ _id: id });

      if (!order) {
        throw new Error('Order not found');
      }

      console.log('✅ Order deleted successfully');
      return order;

    } catch (error) {
      console.error('❌ Error deleting order:', error);
      throw error;
    }
  }

  /**
   * Get orders for specific customer
   */
  async getCustomerOrders(customerId, user) {
    try {
      console.log('🔍 Getting customer orders...');

      // Validate customer exists
      const customer = await Customer.findOne({
        _id: customerId,
        deletedAt: { $exists: false }
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      return this.getOrders({ customerId }, user);

    } catch (error) {
      console.error('❌ Error getting customer orders:', error);
      throw error;
    }
  }

  /**
   * Update order status only
   */
  async updateOrderStatus(id, status, user) {
    try {
      console.log('🔍 Updating order status...');

      const validStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      return this.updateOrder(id, { status }, user);

    } catch (error) {
      console.error('❌ Error updating order status:', error);
      throw error;
    }
  }

  /**
   * Update order payment status only
   */
  async updateOrderPaymentStatus(id, paymentStatus, user) {
    try {
      console.log('🔍 Updating order payment status...');

      const validPaymentStatuses = ['pending', 'paid', 'partial', 'refunded'];
      if (!validPaymentStatuses.includes(paymentStatus)) {
        throw new Error(`Invalid payment status: ${paymentStatus}`);
      }

      return this.updateOrder(id, { paymentStatus }, user);

    } catch (error) {
      console.error('❌ Error updating order payment status:', error);
      throw error;
    }
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStats(user) {
    try {
      console.log('🔍 Getting order statistics...');

      const filter = {};
      
      // Role-based filtering for assistants
      if (user.role === 'assistant') {
        filter.receivedBy = user._id;
      }

      const totalOrders = await Order.countDocuments(filter);
      
      const pendingOrders = await Order.countDocuments({
        ...filter,
        status: 'pending'
      });

      const completedOrders = await Order.countDocuments({
        ...filter,
        status: 'completed'
      });

      const confirmedOrders = await Order.countDocuments({
        ...filter,
        status: 'confirmed'
      });

      const inProgressOrders = await Order.countDocuments({
        ...filter,
        status: 'in_progress'
      });

      // Calculate total revenue (only from completed orders)
      const revenueResult = await Order.aggregate([
        { 
          $match: { 
            ...filter,
            status: 'completed'
          } 
        },
        { 
          $group: { 
            _id: null, 
            totalRevenue: { $sum: '$orderTotal' } 
          } 
        }
      ]);

      const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

      // Payment statistics
      const paidOrders = await Order.countDocuments({
        ...filter,
        paymentStatus: 'paid'
      });

      const pendingPaymentOrders = await Order.countDocuments({
        ...filter,
        paymentStatus: 'pending'
      });

      const partialPaymentOrders = await Order.countDocuments({
        ...filter,
        paymentStatus: 'partial'
      });

      console.log('✅ Order statistics retrieved successfully');
      return {
        totalOrders,
        pendingOrders,
        completedOrders,
        confirmedOrders,
        inProgressOrders,
        totalRevenue,
        paidOrders,
        pendingPaymentOrders,
        partialPaymentOrders
      };

    } catch (error) {
      console.error('❌ Error getting order statistics:', error);
      throw error;
    }
  }

  /**
   * Get recent order activity (for admin dashboard)
   */
  async getRecentActivity(user) {
    try {
      console.log('🔍 Getting recent order activity...');

      const filter = {};
      
      // Only admins can see all activity
      if (user.role !== 'admin') {
        filter.receivedBy = user._id;
      }

      const recentOrders = await Order.find(filter)
        .populate('customerId', 'fullName email')
        .populate('receivedBy', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort({ creationDate: -1 })
        .limit(10)
        .lean();

      console.log('✅ Recent activity retrieved successfully');
      return recentOrders;

    } catch (error) {
      console.error('❌ Error getting recent activity:', error);
      throw error;
    }
  }

  /**
   * Get recent orders (using creationDate instead of dueDate)
   */
  async getRecentOrders(user, days = 7) {
    try {
      console.log('🔍 Getting recent orders...');

      const filter = {};
      
      if (user.role === 'assistant') {
        filter.receivedBy = user._id;
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      filter.creationDate = { $gte: startDate };

      const orders = await Order.find(filter)
        .populate('customerId', 'fullName email phone')
        .populate('receivedBy', 'firstName lastName email')
        .populate('createdBy', 'firstName lastName email')
        .sort({ creationDate: -1 })
        .lean();

      console.log(`✅ Found ${orders.length} recent orders`);
      return orders;

    } catch (error) {
      console.error('❌ Error getting recent orders:', error);
      throw error;
    }
  }
}

module.exports = new OrderService();