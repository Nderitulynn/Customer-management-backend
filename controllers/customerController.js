const Customer = require('../models/Customer');
const WhatsAppService = require('../services/whatsappService');
const { validateCustomer, handleValidationErrors } = require('../utils/validation');
const { USER_ROLES } = require('../models/User');
const User = require('../models/User');

class CustomerController {
  // Get form configuration based on user role
  async getFormConfig(req, res) {
    try {
      const userRole = req.user.role;
      
      const config = {
        [USER_ROLES.ADMIN]: {
          fields: {
            // Basic Information
            fullName: { visible: true, editable: true, required: true },
            email: { visible: true, editable: true, required: true },
            phone: { visible: true, editable: true, required: true },
            
            // Address Information
            address: {
              street: { visible: true, editable: true, required: false },
              city: { visible: true, editable: true, required: false },
              state: { visible: true, editable: true, required: false },
              country: { visible: true, editable: true, required: false },
              zipCode: { visible: true, editable: true, required: false }
            },
            
            // Customer Details
            dateOfBirth: { visible: true, editable: true, required: false },
            gender: { visible: true, editable: true, required: false },
            status: { visible: true, editable: true, required: true },
            segment: { visible: true, editable: true, required: false },
            
            // Assignment and Metadata
            assignedTo: { visible: true, editable: true, required: false },
            notes: { visible: true, editable: true, required: false },
            tags: { visible: true, editable: true, required: false },
            
            // System Fields (Read-only for display)
            createdBy: { visible: true, editable: false, required: false },
            createdAt: { visible: true, editable: false, required: false },
            lastUpdatedBy: { visible: true, editable: false, required: false },
            lastUpdatedAt: { visible: true, editable: false, required: false }
          },
          permissions: {
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canAssign: true,
            canUnassign: true,
            canClaim: true,
            canReassign: true,
            canViewAll: true,
            canExport: true,
            canImport: true,
            canViewAnalytics: true,
            canSendWhatsApp: true,
            canViewAssignmentHistory: true,
            canViewWorkload: true
          },
          actions: {
            create: { enabled: true, label: 'Create Customer' },
            edit: { enabled: true, label: 'Edit Customer' },
            delete: { enabled: true, label: 'Delete Customer' },
            assign: { enabled: true, label: 'Assign to Assistant' },
            unassign: { enabled: true, label: 'Unassign' },
            claim: { enabled: true, label: 'Claim Customer' },
            reassign: { enabled: true, label: 'Reassign Customer' },
            export: { enabled: true, label: 'Export Data' },
            sendWhatsApp: { enabled: true, label: 'Send WhatsApp' },
            viewHistory: { enabled: true, label: 'View Assignment History' }
          }
        },
        
        [USER_ROLES.ASSISTANT]: {
          fields: {
            // Basic Information
            fullName: { visible: true, editable: true, required: true },
            email: { visible: true, editable: true, required: true },
            phone: { visible: true, editable: true, required: true },
            
            // Address Information
            address: {
              street: { visible: true, editable: true, required: false },
              city: { visible: true, editable: true, required: false },
              state: { visible: true, editable: true, required: false },
              country: { visible: true, editable: true, required: false },
              zipCode: { visible: true, editable: true, required: false }
            },
            
            // Customer Details
            dateOfBirth: { visible: true, editable: true, required: false },
            gender: { visible: true, editable: true, required: false },
            status: { visible: true, editable: true, required: true },
            segment: { visible: true, editable: true, required: false },
            
            // Assignment and Metadata (Limited access)
            assignedTo: { visible: true, editable: false, required: false },
            notes: { visible: true, editable: true, required: false },
            tags: { visible: true, editable: true, required: false },
            
            // System Fields (Read-only for display)
            createdBy: { visible: true, editable: false, required: false },
            createdAt: { visible: true, editable: false, required: false },
            lastUpdatedBy: { visible: false, editable: false, required: false },
            lastUpdatedAt: { visible: false, editable: false, required: false }
          },
          permissions: {
            canCreate: true,
            canEdit: true,
            canDelete: false,
            canAssign: false,
            canUnassign: false,
            canClaim: true,
            canReassign: false,
            canViewAll: false,
            canExport: false,
            canImport: false,
            canViewAnalytics: false,
            canSendWhatsApp: true,
            canViewAssignmentHistory: false,
            canViewWorkload: true
          },
          actions: {
            create: { enabled: true, label: 'Create Customer' },
            edit: { enabled: true, label: 'Edit Customer' },
            delete: { enabled: false, label: 'Delete Customer' },
            assign: { enabled: false, label: 'Assign to Assistant' },
            unassign: { enabled: false, label: 'Unassign' },
            claim: { enabled: true, label: 'Claim Customer' },
            reassign: { enabled: false, label: 'Reassign Customer' },
            export: { enabled: false, label: 'Export Data' },
            sendWhatsApp: { enabled: true, label: 'Send WhatsApp' },
            viewHistory: { enabled: false, label: 'View Assignment History' }
          }
        }
      };
      
      const userConfig = config[userRole];
      
      if (!userConfig) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user role'
        });
      }
      
      res.json({
        success: true,
        data: {
          role: userRole,
          config: userConfig,
          metadata: {
            statusOptions: [
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'prospect', label: 'Prospect' },
              { value: 'lead', label: 'Lead' }
            ],
            segmentOptions: [
              { value: 'premium', label: 'Premium' },
              { value: 'regular', label: 'Regular' },
              { value: 'vip', label: 'VIP' },
              { value: 'new', label: 'New Customer' }
            ],
            genderOptions: [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
              { value: 'other', label: 'Other' },
              { value: 'prefer_not_to_say', label: 'Prefer not to say' }
            ]
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Validate if user can claim/reassign customer
  async validateAssignmentPermission(req, res) {
    try {
      const { customerId, action } = req.params; // action: 'claim' or 'reassign'
      const userId = req.user._id;
      const userRole = req.user.role;

      const customer = await Customer.findOne({ _id: customerId, isActive: true });
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      let canPerform = false;
      let message = '';

      switch (action) {
        case 'claim':
          // Check if customer is already assigned
          if (customer.assignedTo) {
            canPerform = false;
            message = 'Customer is already assigned to another assistant';
          } else if (userRole === USER_ROLES.ASSISTANT) {
            // Check assistant's current workload
            const currentWorkload = await this.getAssistantWorkload(userId);
            const maxWorkload = 50; // This should be configurable
            
            if (currentWorkload >= maxWorkload) {
              canPerform = false;
              message = `Maximum workload reached (${currentWorkload}/${maxWorkload})`;
            } else {
              canPerform = true;
              message = 'Customer can be claimed';
            }
          } else {
            canPerform = true;
            message = 'Admin can claim any customer';
          }
          break;

        case 'reassign':
          if (userRole !== USER_ROLES.ADMIN) {
            canPerform = false;
            message = 'Only administrators can reassign customers';
          } else if (!customer.assignedTo) {
            canPerform = false;
            message = 'Customer is not currently assigned';
          } else {
            canPerform = true;
            message = 'Customer can be reassigned';
          }
          break;

        default:
          canPerform = false;
          message = 'Invalid action';
      }

      res.json({
        success: true,
        data: {
          canPerform,
          message,
          customer: {
            id: customer._id,
            name: customer.fullName,
            currentAssignment: customer.assignedTo,
            lastAssignmentDate: customer.lastAssignmentDate
          }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get assistant's current workload
  async getAssistantWorkload(assistantId) {
    try {
      const workload = await Customer.countDocuments({
        assignedTo: assistantId,
        isActive: true
      });
      return workload;
    } catch (error) {
      throw new Error('Error calculating workload');
    }
  }

  // Get workload statistics for all assistants (Admin only)
  async getWorkloadStats(req, res) {
    try {
      if (req.user.role !== USER_ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      const workloadStats = await Customer.aggregate([
        { $match: { isActive: true, assignedTo: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: '$assignedTo',
            customerCount: { $sum: 1 },
            segments: {
              $push: '$segment'
            },
            statuses: {
              $push: '$status'
            }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'assistant'
          }
        },
        {
          $project: {
            assistant: { $arrayElemAt: ['$assistant', 0] },
            customerCount: 1,
            segmentBreakdown: {
              $reduce: {
                input: '$segments',
                initialValue: {},
                in: {
                  $mergeObjects: [
                    '$$value',
                    {
                      $cond: [
                        { $eq: [{ $type: '$$this' }, 'string'] },
                        { $arrayToObject: [[{ k: '$$this', v: { $add: [{ $ifNull: [{ $getField: { field: '$$this', input: '$$value' } }, 0] }, 1] } }]] },
                        {}
                      ]
                    }
                  ]
                }
              }
            }
          }
        },
        { $sort: { customerCount: -1 } }
      ]);

      // Get unassigned customers count
      const unassignedCount = await Customer.countDocuments({
        isActive: true,
        assignedTo: { $exists: false }
      });

      res.json({
        success: true,
        data: {
          assignedWorkload: workloadStats,
          unassignedCustomers: unassignedCount,
          totalCustomers: workloadStats.reduce((sum, stat) => sum + stat.customerCount, 0) + unassignedCount
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Get assistant's personal workload
  async getMyWorkload(req, res) {
    try {
      if (req.user.role !== USER_ROLES.ASSISTANT) {
        return res.status(403).json({
          success: false,
          message: 'This endpoint is only available for assistants'
        });
      }

      const workload = await Customer.aggregate([
        { $match: { assignedTo: req.user._id, isActive: true } },
        {
          $group: {
            _id: null,
            totalCustomers: { $sum: 1 },
            byStatus: {
              $push: {
                status: '$status',
                count: 1
              }
            },
            bySegment: {
              $push: {
                segment: '$segment',
                count: 1
              }
            }
          }
        }
      ]);

      const maxWorkload = 50; // This should be configurable
      const currentWorkload = workload[0]?.totalCustomers || 0;

      res.json({
        success: true,
        data: {
          currentWorkload,
          maxWorkload,
          utilizationPercentage: Math.round((currentWorkload / maxWorkload) * 100),
          canAcceptMore: currentWorkload < maxWorkload,
          statistics: workload[0] || { totalCustomers: 0, byStatus: [], bySegment: [] }
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // Claim customer (Assistant only with validation)
  async claimCustomer(req, res) {
    try {
      const customerId = req.params.id;
      const userId = req.user._id;

      // Check if customer exists and is not already assigned
      const customer = await Customer.findOne({ _id: customerId, isActive: true });
      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      // Prevent double-claiming
      if (customer.assignedTo) {
        return res.status(400).json({
          success: false,
          message: 'Customer is already assigned to another assistant'
        });
      }

      // Check workload for assistants
      if (req.user.role === USER_ROLES.ASSISTANT) {
        const currentWorkload = await this.getAssistantWorkload(userId);
        const maxWorkload = 50;
        
        if (currentWorkload >= maxWorkload) {
          return res.status(400).json({
            success: false,
            message: `Maximum workload reached (${currentWorkload}/${maxWorkload}). Cannot claim more customers.`
          });
        }
      }

      // Create assignment history entry
      const assignmentHistory = {
        assignedTo: userId,
        assignedBy: userId,
        assignmentDate: new Date(),
        assignmentType: 'claim',
        reason: 'Customer claimed by assistant'
      };

      // Update customer
      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        {
          assignedTo: userId,
          lastAssignmentDate: new Date(),
          lastUpdatedBy: userId,
          $push: { assignmentHistory: assignmentHistory }
        },
        { new: true, runValidators: true }
      )
      .populate('assignedTo', 'firstName lastName email')
      .populate('lastUpdatedBy', 'firstName lastName');

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

  // Get assignment history for a customer (Admin only)
  async getAssignmentHistory(req, res) {
    try {
      if (req.user.role !== USER_ROLES.ADMIN) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Admin privileges required.'
        });
      }

      const customerId = req.params.id;
      const customer = await Customer.findOne({ _id: customerId, isActive: true })
        .populate('assignmentHistory.assignedTo', 'firstName lastName email')
        .populate('assignmentHistory.assignedBy', 'firstName lastName email')
        .select('fullName email assignmentHistory');

      if (!customer) {
        return res.status(404).json({
          success: false,
          message: 'Customer not found'
        });
      }

      res.json({
        success: true,
        data: {
          customer: {
            id: customer._id,
            name: customer.fullName,
            email: customer.email
          },
          history: customer.assignmentHistory.sort((a, b) => new Date(b.assignmentDate) - new Date(a.assignmentDate))
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

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
        customerData.lastAssignmentDate = new Date();
        customerData.assignmentHistory = [{
          assignedTo: req.user._id,
          assignedBy: req.user._id,
          assignmentDate: new Date(),
          assignmentType: 'auto-assign',
          reason: 'Auto-assigned on creation'
        }];
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

      const filter = { isActive: true };
      
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

  // Assign/Reassign customer to assistant (Admin only)
  async assignCustomer(req, res) {
    try {
      if (req.user.role !== USER_ROLES.ADMIN) {
        return res.status(403).json({ 
          success: false, 
          message: 'Access denied' 
        });
      }

      const { assignedTo, reason = 'Administrative assignment' } = req.body;
      const customerId = req.params.id;

      const customer = await Customer.findById(customerId);
      if (!customer) {
        return res.status(404).json({ 
          success: false, 
          message: 'Customer not found' 
        });
      }

      // Create assignment history entry
      const assignmentHistory = {
        assignedTo: assignedTo || null,
        assignedBy: req.user._id,
        assignmentDate: new Date(),
        assignmentType: assignedTo ? 'assign' : 'unassign',
        reason: reason,
        previousAssignee: customer.assignedTo
      };

      const updatedCustomer = await Customer.findByIdAndUpdate(
        customerId,
        { 
          assignedTo: assignedTo || null,
          lastAssignmentDate: assignedTo ? new Date() : null,
          lastUpdatedBy: req.user._id,
          $push: { assignmentHistory: assignmentHistory }
        },
        { new: true, runValidators: true }
      )
      .populate('createdBy', 'firstName lastName')
      .populate('lastUpdatedBy', 'firstName lastName')
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

  // Send WhatsApp message to customer with role-based access
  async sendWhatsAppMessage(req, res) {
    try {
      const { message } = req.body;
      
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

  // Get customer statistics for dashboard
  async getCustomerStats(req, res) {
    try {
      const baseFilter = { isActive: true };
      if (req.user.role === USER_ROLES.ASSISTANT) {
        baseFilter.assignedTo = req.user._id;
      }

      const stats = await Customer.getStats();
      const segments = await Customer.getBySegment();
      
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      const recentCustomers = await Customer.countDocuments({
        ...baseFilter,
        createdAt: { $gte: thirtyDaysAgo }
      });

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