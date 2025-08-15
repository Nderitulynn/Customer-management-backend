const Order = require('../models/Order');
const Customer = require('../models/Customer');
const mongoose = require('mongoose');

class CustomerOrderService {
  
  /**
   * Get paginated orders for a specific customer
   */
  async getCustomerOrders(customerId, queryParams = {}, user) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        status = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = queryParams;

      // Build query
      const query = { customerId: customerId };

      // Add status filter
      if (status) {
        query.status = status.toLowerCase();
      }

      // Add search functionality
      if (search) {
        query.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'items.name': { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination - assignedTo is optional
      const orders = await Order.find(query)
        .populate('customerId', 'name email phone')
        .populate({
          path: 'assignedTo',
          select: 'name email',
          // This will handle cases where assignedTo is null/undefined
          options: { strictPopulate: false }
        })
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Get total count for pagination
      const totalOrders = await Order.countDocuments(query);
      const totalPages = Math.ceil(totalOrders / parseInt(limit));

      return {
        success: true,
        data: orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      };

    } catch (error) {
      console.error('Error in getCustomerOrders:', error);
      throw new Error(`Failed to fetch customer orders: ${error.message}`);
    }
  }

  /**
   * Get order statistics for customer dashboard
   */
  async getCustomerOrderStats(customerId, user) {
    try {
      const aggregation = await Order.aggregate([
       { $match: { customerId: new mongoose.Types.ObjectId(customerId) } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
            },
            inProgressOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'in-progress'] }, 1, 0] }
            },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
            },
            totalValue: { $sum: '$totalAmount' },
            averageOrderValue: { $avg: '$totalAmount' }
          }
        }
      ]);

      const stats = aggregation[0] || {
        totalOrders: 0,
        pendingOrders: 0,
        inProgressOrders: 0,
        completedOrders: 0,
        cancelledOrders: 0,
        totalValue: 0,
        averageOrderValue: 0
      };

      // Remove the _id field
      delete stats._id;

      return {
        success: true,
        data: {
          ...stats,
          totalValue: Number(stats.totalValue?.toFixed(2) || 0),
          averageOrderValue: Number(stats.averageOrderValue?.toFixed(2) || 0)
        }
      };

    } catch (error) {
      console.error('Error in getCustomerOrderStats:', error);
      throw new Error(`Failed to fetch order statistics: ${error.message}`);
    }
  }

  /**
   * Get recent orders for customer dashboard (last 5)
   */
  async getRecentCustomerOrders(customerId, user) {
    try {
      const recentOrders = await Order.find({ customerId: customerId })
        .populate({
          path: 'assignedTo',
          select: 'name email',
          options: { strictPopulate: false }
        })
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      return {
        success: true,
        data: recentOrders
      };

    } catch (error) {
      console.error('Error in getRecentCustomerOrders:', error);
      throw new Error(`Failed to fetch recent orders: ${error.message}`);
    }
  }

  /**
   * Create a new order for customer
   */
  async createCustomerOrder(orderData, user) {
    try {
      // Validate required fields
      if (!orderData.customerId) {
        throw new Error('Customer ID is required');
      }

      if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
        throw new Error('Order must contain at least one item');
      }

      // Generate order number if not provided
      if (!orderData.orderNumber) {
        const orderCount = await Order.countDocuments();
        orderData.orderNumber = `ORD-${Date.now()}-${orderCount + 1}`;
      }

      // Calculate total amount if not provided
      if (!orderData.totalAmount && orderData.items) {
        orderData.totalAmount = orderData.items.reduce((total, item) => {
          return total + (item.quantity * item.price);
        }, 0);
      }

      // Set default status and created by user
      orderData.status = orderData.status || 'pending';
      orderData.createdBy = user._id;

      // Explicitly don't set assignedTo for customer-created orders
      // This allows orders to be created without assignment
      // Admin/staff can assign them later through other endpoints

      const order = new Order(orderData);
      const savedOrder = await order.save();

      // Populate the created order - assignedTo will be null for customer orders
      const populatedOrder = await Order.findById(savedOrder._id)
        .populate('customerId', 'name email phone')
        .populate({
          path: 'assignedTo',
          select: 'name email',
          options: { strictPopulate: false }
        })
        .populate('createdBy', 'name email');

      return {
        success: true,
        data: populatedOrder,
        message: 'Order created successfully'
      };

    } catch (error) {
      console.error('Error in createCustomerOrder:', error);
      throw new Error(`Failed to create order: ${error.message}`);
    }
  }

  /**
   * Get specific order details with ownership verification
   */
  async getCustomerOrderDetails(orderId, customerId, user) {
    try {
      const order = await Order.findOne({
        _id: orderId,
        customerId: customerId
      })
        .populate('customerId', 'name email phone')
        .populate({
          path: 'assignedTo',
          select: 'name email',
          options: { strictPopulate: false }
        })
        .populate('createdBy', 'name email')
        .lean();

      if (!order) {
        return null;
      }

      return {
        success: true,
        data: order
      };

    } catch (error) {
      console.error('Error in getCustomerOrderDetails:', error);
      throw new Error(`Failed to fetch order details: ${error.message}`);
    }
  }

  /**
   * Cancel customer's own order (only if pending)
   */
  async cancelCustomerOrder(orderId, customerId, user) {
    try {
      const order = await Order.findOne({
        _id: orderId,
        customerId: customerId
      });

      if (!order) {
        return null;
      }

      // Check if order can be cancelled
      if (order.status !== 'pending') {
        throw new Error('Only pending orders can be cancelled');
      }

      // Update order status
      order.status = 'cancelled';
      order.updatedAt = new Date();
      
      const updatedOrder = await order.save();

      return {
        success: true,
        data: updatedOrder,
        message: 'Order cancelled successfully'
      };

    } catch (error) {
      console.error('Error in cancelCustomerOrder:', error);
      throw new Error(`Failed to cancel order: ${error.message}`);
    }
  }

  /**
   * Get customer's orders by status
   */
  async getCustomerOrdersByStatus(customerId, status, queryParams = {}, user) {
    try {
      const {
        page = 1,
        limit = 10,
        search = '',
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = queryParams;

      // Build query
      const query = {
        customerId: customerId,
        status: status
      };

      // Add search functionality
      if (search) {
        query.$or = [
          { orderNumber: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
          { 'items.name': { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Execute query
      const orders = await Order.find(query)
        .populate('customerId', 'name email phone')
        .populate({
          path: 'assignedTo',
          select: 'name email',
          options: { strictPopulate: false }
        })
        .sort({ [sortBy]: sortDirection })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const totalOrders = await Order.countDocuments(query);
      const totalPages = Math.ceil(totalOrders / parseInt(limit));

      return {
        success: true,
        data: orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          status: status
        }
      };

    } catch (error) {
      console.error('Error in getCustomerOrdersByStatus:', error);
      throw new Error(`Failed to fetch orders by status: ${error.message}`);
    }
  }

  /**
   * Create a new order based on existing order (reorder)
   */
  async reorderCustomerOrder(originalOrderId, customerId, user) {
    try {
      // Get the original order
      const originalOrder = await Order.findOne({
        _id: originalOrderId,
        customerId: customerId
      }).lean();

      if (!originalOrder) {
        return null;
      }

      // Create new order data based on original
      const newOrderData = {
        customerId: originalOrder.customerId,
        items: originalOrder.items,
        description: `Reorder of ${originalOrder.orderNumber}`,
        totalAmount: originalOrder.totalAmount,
        priority: originalOrder.priority || 'medium',
        status: 'pending',
        createdBy: user._id
        // Note: assignedTo is intentionally not copied - new orders start unassigned
      };

      // Generate new order number
      const orderCount = await Order.countDocuments();
      newOrderData.orderNumber = `ORD-${Date.now()}-${orderCount + 1}`;

      // Create the new order
      const newOrder = new Order(newOrderData);
      const savedOrder = await newOrder.save();

      // Populate and return
      const populatedOrder = await Order.findById(savedOrder._id)
        .populate('customerId', 'name email phone')
        .populate({
          path: 'assignedTo',
          select: 'name email',
          options: { strictPopulate: false }
        })
        .populate('createdBy', 'name email');

      return {
        success: true,
        data: populatedOrder,
        message: 'Order duplicated successfully'
      };

    } catch (error) {
      console.error('Error in reorderCustomerOrder:', error);
      throw new Error(`Failed to create reorder: ${error.message}`);
    }
  }
}

module.exports = new CustomerOrderService();