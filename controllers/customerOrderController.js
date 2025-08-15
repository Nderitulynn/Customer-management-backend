const customerOrderService = require('../services/customerOrderService');
const assignmentService = require('../services/assignmentService');

class CustomerOrderController {

  /**
   * Get customer's own orders with pagination and search
   * GET /api/customer-orders
   */
  async getMyOrders(req, res) {
    try {
      console.log('🔍 CustomerOrderController.getMyOrders called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const orders = await customerOrderService.getCustomerOrders(
        req.user.customerProfile, 
        req.query, 
        req.user
      );
      
      res.status(200).json(orders);
      
    } catch (error) {
      console.error('❌ Error fetching customer orders:', error);
      res.status(500).json({
        error: 'Failed to fetch orders',
        message: error.message
      });
    }
  }

  /**
   * Get customer's order statistics for dashboard
   * GET /api/customer-orders/stats
   */
  async getOrderStats(req, res) {
    try {
      console.log('🔍 CustomerOrderController.getOrderStats called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const stats = await customerOrderService.getCustomerOrderStats(
        req.user.customerProfile, 
        req.user
      );
      
      res.status(200).json(stats);
      
    } catch (error) {
      console.error('❌ Error fetching order statistics:', error);
      res.status(500).json({
        error: 'Failed to fetch order statistics',
        message: error.message
      });
    }
  }

  /**
   * Get customer's recent orders (last 5) for dashboard
   * GET /api/customer-orders/recent
   */
  async getRecentOrders(req, res) {
    try {
      console.log('🔍 CustomerOrderController.getRecentOrders called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const recentOrders = await customerOrderService.getRecentCustomerOrders(
        req.user.customerProfile, 
        req.user
      );
      
      res.status(200).json(recentOrders);
      
    } catch (error) {
      console.error('❌ Error fetching recent orders:', error);
      res.status(500).json({
        error: 'Failed to fetch recent orders',
        message: error.message
      });
    }
  }

  /**
   * Create new order for customer
   * POST /api/customer-orders
   */
  async createOrder(req, res) {
    try {
      console.log('🔍 CustomerOrderController.createOrder called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      // Get next assistant to assign the order to
      console.log('🎯 Assigning order to next available assistant...');
      const assignedAssistantId = await assignmentService.assignOrderToAssistant();
      
      // Prepare order data with customer assignment and auto-assigned assistant
      const orderData = {
        ...req.body,
        customerId: req.user.customerProfile,
        createdBy: req.user._id,
        receivedBy: assignedAssistantId  // Auto-assign to next assistant
      };

      console.log(`✅ Order will be assigned to assistant: ${assignedAssistantId}`);

      const order = await customerOrderService.createCustomerOrder(orderData, req.user);
      
      res.status(201).json(order);
      
    } catch (error) {
      console.error('❌ Error creating customer order:', error);
      
      // Handle assignment service errors specifically
      if (error.message.includes('No available assistants')) {
        return res.status(503).json({
          error: 'Service temporarily unavailable - No assistants available to handle your order. Please try again later.',
          message: error.message
        });
      }
      
      if (error.message.includes('assignment failed') || error.message.includes('Failed to determine next assistant')) {
        return res.status(500).json({
          error: 'Order assignment failed - Unable to assign your order to an assistant. Please try again.',
          message: error.message
        });
      }
      
      // Handle validation errors
      if (error.message.includes('validation') || error.message.includes('required')) {
        return res.status(400).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: 'Failed to create order',
        message: error.message
      });
    }
  }

  /**
   * Get specific order details with ownership check
   * GET /api/customer-orders/:orderId
   */
  async getOrderDetails(req, res) {
    try {
      console.log('🔍 CustomerOrderController.getOrderDetails called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const { orderId } = req.params;
      const order = await customerOrderService.getCustomerOrderDetails(
        orderId, 
        req.user.customerProfile, 
        req.user
      );
      
      if (!order) {
        return res.status(404).json({
          error: 'Order not found'
        });
      }

      res.status(200).json(order);
      
    } catch (error) {
      console.error('❌ Error fetching order details:', error);
      
      // Handle permission errors specifically
      if (error.message.includes('permission') || error.message.includes('access')) {
        return res.status(403).json({
          error: 'Access denied - You can only view your own orders'
        });
      }
      
      res.status(500).json({
        error: 'Failed to fetch order details',
        message: error.message
      });
    }
  }

  /**
   * Cancel customer's own pending order
   * PUT /api/customer-orders/:orderId/cancel
   */
  async cancelOrder(req, res) {
    try {
      console.log('🔍 CustomerOrderController.cancelOrder called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const { orderId } = req.params;
      const result = await customerOrderService.cancelCustomerOrder(
        orderId, 
        req.user.customerProfile, 
        req.user
      );
      
      if (!result) {
        return res.status(404).json({
          error: 'Order not found or cannot be cancelled'
        });
      }

      res.status(200).json({
        message: 'Order cancelled successfully',
        order: result
      });
      
    } catch (error) {
      console.error('❌ Error cancelling customer order:', error);
      
      // Handle specific cancellation errors
      if (error.message.includes('permission') || error.message.includes('access')) {
        return res.status(403).json({
          error: 'Access denied - You can only cancel your own orders'
        });
      }
      
      if (error.message.includes('status') || error.message.includes('cannot be cancelled')) {
        return res.status(400).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: 'Failed to cancel order',
        message: error.message
      });
    }
  }

  /**
   * Get customer's orders filtered by status
   * GET /api/customer-orders/status/:status
   */
  async getOrdersByStatus(req, res) {
    try {
      console.log('🔍 CustomerOrderController.getOrdersByStatus called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const { status } = req.params;
      
      // Validate status parameter
      const validStatuses = ['pending', 'in-progress', 'completed', 'cancelled', 'on-hold'];
      if (!validStatuses.includes(status.toLowerCase())) {
        return res.status(400).json({
          error: `Invalid status. Valid options: ${validStatuses.join(', ')}`
        });
      }

      const orders = await customerOrderService.getCustomerOrdersByStatus(
        req.user.customerProfile, 
        status.toLowerCase(),
        req.query,
        req.user
      );
      
      res.status(200).json(orders);
      
    } catch (error) {
      console.error('❌ Error fetching orders by status:', error);
      res.status(500).json({
        error: 'Failed to fetch orders by status',
        message: error.message
      });
    }
  }

  /**
   * Create duplicate order based on existing order (reorder)
   * PUT /api/customer-orders/:orderId/reorder
   */
  async reorderOrder(req, res) {
    try {
      console.log('🔍 CustomerOrderController.reorderOrder called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const { orderId } = req.params;
      
      // Get next assistant for the reorder
      console.log('🎯 Assigning reorder to next available assistant...');
      const assignedAssistantId = await assignmentService.assignOrderToAssistant();
      
      // Create new order based on existing order
      const newOrder = await customerOrderService.reorderCustomerOrder(
        orderId,
        req.user.customerProfile,
        req.user,
        assignedAssistantId  // Pass the assigned assistant ID for reorder
      );
      
      if (!newOrder) {
        return res.status(404).json({
          error: 'Original order not found or access denied'
        });
      }

      res.status(201).json({
        message: 'Order duplicated successfully',
        originalOrderId: orderId,
        assignedTo: assignedAssistantId,
        newOrder: newOrder
      });
      
    } catch (error) {
      console.error('❌ Error reordering:', error);
      
      // Handle assignment service errors for reorders
      if (error.message.includes('No available assistants')) {
        return res.status(503).json({
          error: 'Service temporarily unavailable - No assistants available to handle your reorder. Please try again later.',
          message: error.message
        });
      }
      
      // Handle permission errors
      if (error.message.includes('permission') || error.message.includes('access')) {
        return res.status(403).json({
          error: 'Access denied - You can only reorder your own orders'
        });
      }
      
      // Handle validation errors
      if (error.message.includes('validation') || error.message.includes('required')) {
        return res.status(400).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: 'Failed to create reorder',
        message: error.message
      });
    }
  }
}

module.exports = new CustomerOrderController();