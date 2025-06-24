const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const NotificationService = require('../services/NotificationService');

class OrderController {
  // Create new order with validation
  async createOrder(req, res) {
    try {
      const { customerId, items, deliveryDate } = req.body;

      // Validate customer exists
      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Validate inventory and calculate totals
      let subtotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const product = await Product.findById(item.productId);
        if (!product) {
          return res.status(404).json({ error: `Product ${item.productId} not found` });
        }
        
        if (product.stock < item.quantity) {
          return res.status(400).json({ error: `Insufficient stock for ${product.name}` });
        }

        const itemTotal = product.price * item.quantity;
        subtotal += itemTotal;
        
        validatedItems.push({
          productId: item.productId,
          quantity: item.quantity,
          price: product.price,
          total: itemTotal
        });

        // Update inventory
        product.stock -= item.quantity;
        await product.save();
      }

      // Calculate totals
      const taxRate = 0.1; // 10% tax
      const tax = subtotal * taxRate;
      const total = subtotal + tax;

      // Create order
      const order = new Order({
        customerId,
        items: validatedItems,
        subtotal,
        tax,
        total,
        status: 'pending',
        deliveryDate: deliveryDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Default 7 days
        createdAt: new Date()
      });

      await order.save();

      // Send notification
      await NotificationService.sendOrderConfirmation(customer.email, order);

      res.status(201).json({
        success: true,
        order: {
          id: order._id,
          status: order.status,
          total: order.total,
          deliveryDate: order.deliveryDate
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update order status
  async updateStatus(req, res) {
    try {
      const { orderId } = req.params;
      const { status } = req.body;

      const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const order = await Order.findById(orderId).populate('customerId');
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const oldStatus = order.status;
      order.status = status;
      order.updatedAt = new Date();

      await order.save();

      // Send status update notification
      await NotificationService.sendStatusUpdate(order.customerId.email, order, oldStatus, status);

      res.json({
        success: true,
        order: {
          id: order._id,
          status: order.status,
          updatedAt: order.updatedAt
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get order details
  async getOrder(req, res) {
    try {
      const { orderId } = req.params;

      const order = await Order.findById(orderId)
        .populate('customerId', 'name email')
        .populate('items.productId', 'name price');

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json({ success: true, order });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Get customer orders
  async getCustomerOrders(req, res) {
    try {
      const { customerId } = req.params;
      const { status, page = 1, limit = 10 } = req.query;

      const query = { customerId };
      if (status) query.status = status;

      const orders = await Order.find(query)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('items.productId', 'name');

      const total = await Order.countDocuments(query);

      res.json({
        success: true,
        orders,
        totalPages: Math.ceil(total / limit),
        currentPage: page
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Apply discount
  async applyDiscount(req, res) {
    try {
      const { orderId } = req.params;
      const { discountCode, discountAmount } = req.body;

      const order = await Order.findById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (order.status !== 'pending') {
        return res.status(400).json({ error: 'Cannot apply discount to processed order' });
      }

      // Apply discount
      order.discount = {
        code: discountCode,
        amount: discountAmount
      };
      order.total = order.subtotal + order.tax - discountAmount;
      order.updatedAt = new Date();

      await order.save();

      res.json({
        success: true,
        order: {
          id: order._id,
          total: order.total,
          discount: order.discount
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Update delivery date
  async updateDeliveryDate(req, res) {
    try {
      const { orderId } = req.params;
      const { deliveryDate } = req.body;

      const order = await Order.findById(orderId).populate('customerId');
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const oldDate = order.deliveryDate;
      order.deliveryDate = new Date(deliveryDate);
      order.updatedAt = new Date();

      await order.save();

      // Notify customer of delivery date change
      await NotificationService.sendDeliveryUpdate(order.customerId.email, order, oldDate);

      res.json({
        success: true,
        order: {
          id: order._id,
          deliveryDate: order.deliveryDate
        }
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  // Cancel order
  async cancelOrder(req, res) {
    try {
      const { orderId } = req.params;

      const order = await Order.findById(orderId).populate('customerId');
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      if (['shipped', 'delivered'].includes(order.status)) {
        return res.status(400).json({ error: 'Cannot cancel shipped/delivered order' });
      }

      // Restore inventory
      for (const item of order.items) {
        const product = await Product.findById(item.productId);
        if (product) {
          product.stock += item.quantity;
          await product.save();
        }
      }

      order.status = 'cancelled';
      order.updatedAt = new Date();
      await order.save();

      // Send cancellation notification
      await NotificationService.sendOrderCancellation(order.customerId.email, order);

      res.json({
        success: true,
        message: 'Order cancelled successfully'
      });

    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new OrderController();