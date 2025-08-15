const customerService = require('../services/customerService');

class CustomerController {
  
  /**
   * Get all customers (role-based filtering)
   */
  async getCustomers(req, res) {
    try {
      console.log('🔍 CustomerController.getCustomers called');
      
      const customers = await customerService.getCustomers(req.query, req.user);
      
      // Return customers array directly
      res.status(200).json(customers);
      
    } catch (error) {
      console.error('❌ Error in getCustomers:', error);
      res.status(500).json({
        error: 'Failed to fetch customers',
        message: error.message
      });
    }
  }

  /**
   * Get customer by ID (with permission check)
   */
  async getCustomerById(req, res) {
    try {
      const customer = await customerService.getCustomerById(req.params.id, req.user);
      
      if (!customer) {
        return res.status(404).json({
          error: 'Customer not found'
        });
      }

      // Return customer object directly
      res.status(200).json(customer);
      
    } catch (error) {
      console.error('❌ Error fetching customer:', error);
      res.status(500).json({
        error: 'Failed to fetch customer',
        message: error.message
      });
    }
  }

  /**
   * Create new customer
   */
  async createCustomer(req, res) {
    try {
      const customer = await customerService.createCustomer(req.body, req.user);
      
      // Return created customer object directly
      res.status(201).json(customer);
      
    } catch (error) {
      console.error('❌ Error creating customer:', error);
      
      // Handle validation errors
      if (error.message.includes('validation') || error.message.includes('required')) {
        return res.status(400).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: 'Failed to create customer',
        message: error.message
      });
    }
  }

  /**
   * Update customer (with permission check)
   */
  async updateCustomer(req, res) {
    try {
      const customer = await customerService.updateCustomer(req.params.id, req.body, req.user);
      
      if (!customer) {
        return res.status(404).json({
          error: 'Customer not found'
        });
      }

      // Return updated customer object directly
      res.status(200).json(customer);
      
    } catch (error) {
      console.error('❌ Error updating customer:', error);
      
      if (error.message.includes('validation')) {
        return res.status(400).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: 'Failed to update customer',
        message: error.message
      });
    }
  }

  /**
   * Delete customer (with permission check)
   */
  async deleteCustomer(req, res) {
    try {
      const result = await customerService.deleteCustomer(req.params.id, req.user);
      
      if (!result) {
        return res.status(404).json({
          error: 'Customer not found'
        });
      }

      // Return simple success response
      res.status(200).json({
        message: 'Customer deleted successfully'
      });
      
    } catch (error) {
      console.error('❌ Error deleting customer:', error);
      res.status(500).json({
        error: 'Failed to delete customer',
        message: error.message
      });
    }
  }

  /**
   * Get dashboard statistics (role-based)
   */
  async getDashboardStats(req, res) {
    try {
      const stats = await customerService.getDashboardStats(req.user);
      
      // Return stats object directly
      res.status(200).json(stats);
      
    } catch (error) {
      console.error('❌ Error fetching dashboard stats:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard statistics',
        message: error.message
      });
    }
  }

  /**
   * Get customers assigned to assistant
   */
  async getAssignedCustomers(req, res) {
    try {
      const { assistantId } = req.params;
      const customers = await customerService.getCustomersByAssistant(assistantId, req.query, req.user);
      
      res.status(200).json(customers);
      
    } catch (error) {
      console.error('❌ Error fetching assigned customers:', error);
      res.status(500).json({
        error: 'Failed to fetch assigned customers',
        message: error.message
      });
    }
  }

  /**
   * Get unassigned customers
   */
  async getUnassignedCustomers(req, res) {
    try {
      const customers = await customerService.getUnassignedCustomers(req.query, req.user);
      
      res.status(200).json(customers);
      
    } catch (error) {
      console.error('❌ Error fetching unassigned customers:', error);
      res.status(500).json({
        error: 'Failed to fetch unassigned customers',
        message: error.message
      });
    }
  }

  /**
   * Assign customer to assistant
   */
  async assignCustomer(req, res) {
    try {
      const { id } = req.params;
      const { assistantId } = req.body;
      
      const customer = await customerService.assignCustomer(id, assistantId, req.user);
      
      res.status(200).json({
        message: 'Customer assigned successfully',
        customer
      });
      
    } catch (error) {
      console.error('❌ Error assigning customer:', error);
      res.status(500).json({
        error: 'Failed to assign customer',
        message: error.message
      });
    }
  }

  /**
   * Get available assistants for assignment
   */
  async getAvailableAssistants(req, res) {
    try {
      const assistants = await customerService.getAvailableAssistants(req.user);
      
      res.status(200).json(assistants);
      
    } catch (error) {
      console.error('❌ Error fetching available assistants:', error);
      res.status(500).json({
        error: 'Failed to fetch available assistants',
        message: error.message
      });
    }
  }

  // ==========================================
  // CUSTOMER PORTAL FUNCTIONS
  // ==========================================

  /**
   * Get customer dashboard (Customer Portal)
   * Shows personal dashboard for logged-in customer
   */
  async getDashboard(req, res) {
    try {
      console.log('🔍 CustomerController.getDashboard (Customer Portal) called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const dashboard = await customerService.getCustomerDashboard(req.user.customerProfile, req.user);
      
      res.status(200).json(dashboard);
      
    } catch (error) {
      console.error('❌ Error fetching customer dashboard:', error);
      res.status(500).json({
        error: 'Failed to fetch dashboard',
        message: error.message
      });
    }
  }

  /**
   * Get customer's own profile (Customer Portal)
   */
  async getProfile(req, res) {
    try {
      console.log('🔍 CustomerController.getProfile called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      const profile = await customerService.getCustomerProfile(req.user.customerProfile, req.user);
      
      if (!profile) {
        return res.status(404).json({
          error: 'Profile not found'
        });
      }

      res.status(200).json(profile);
      
    } catch (error) {
      console.error('❌ Error fetching customer profile:', error);
      res.status(500).json({
        error: 'Failed to fetch profile',
        message: error.message
      });
    }
  }

  /**
   * Update customer's own profile (Customer Portal)
   * Only allows editing safe fields
   */
  async updateProfile(req, res) {
    try {
      console.log('🔍 CustomerController.updateProfile called');
      
      // Security check: ensure user has customer profile
      if (!req.user.customerProfile) {
        return res.status(403).json({
          error: 'Access denied - Customer profile required'
        });
      }

      // Filter to only allow safe fields for customer editing
      const allowedFields = ['email', 'phone', 'address', 'name'];
      const safeUpdateData = {};
      
      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          safeUpdateData[field] = req.body[field];
        }
      });

      const updatedProfile = await customerService.updateCustomerProfile(
        req.user.customerProfile, 
        safeUpdateData, 
        req.user
      );
      
      if (!updatedProfile) {
        return res.status(404).json({
          error: 'Profile not found'
        });
      }

      res.status(200).json(updatedProfile);
      
    } catch (error) {
      console.error('❌ Error updating customer profile:', error);
      
      if (error.message.includes('validation')) {
        return res.status(400).json({
          error: error.message
        });
      }
      
      res.status(500).json({
        error: 'Failed to update profile',
        message: error.message
      });
    }
  }
}

module.exports = new CustomerController();