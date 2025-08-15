const messageService = require('../services/messageService');
const { validationResult } = require('express-validator');

class MessageController {
  /**
   * Create a new message (Customer only)
   * POST /api/messages
   */
  async createMessage(req, res) {
    try {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { subject, content, priority } = req.body;
      const user = req.user;
      const customerContext = req.customerContext;

      if (!customerContext) {
        return res.status(400).json({
          success: false,
          error: 'Customer context not found'
        });
      }

      const message = await messageService.createMessage(
        { subject, content, priority },
        user,
        customerContext
      );

      res.status(201).json({
        success: true,
        message: 'Message created successfully',
        data: message
      });

    } catch (error) {
      console.error('Error in createMessage:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to create message'
      });
    }
  }

  /**
   * Reply to an existing message
   * POST /api/messages/:id/reply
   */
  async replyToMessage(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { id: messageId } = req.params;
      const { content, priority } = req.body;
      const user = req.user;

      const reply = await messageService.replyToMessage(
        messageId,
        { content, priority },
        user
      );

      res.status(201).json({
        success: true,
        message: 'Reply sent successfully',
        data: reply
      });

    } catch (error) {
      console.error('Error in replyToMessage:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to send reply'
      });
    }
  }

  /**
   * Get messages for the current user (with pagination and filtering)
   * GET /api/messages
   */
  async getMessages(req, res) {
    try {
      const user = req.user;
      const messageContext = req.messageContext;
      
      // Extract query parameters
      const {
        page = 1,
        limit = 20,
        status,
        priority,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        messageType
      } = req.query;

      // Validate pagination parameters
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Max 100 per page

      const options = {
        page: pageNum,
        limit: limitNum,
        status,
        priority,
        search,
        sortBy,
        sortOrder,
        messageType
      };

      const result = await messageService.getMessages(user, messageContext, options);

      res.json({
        success: true,
        data: result.messages,
        pagination: result.pagination,
        context: result.context
      });

    } catch (error) {
      console.error('Error in getMessages:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve messages'
      });
    }
  }

  /**
   * Get a specific message by ID
   * GET /api/messages/:id
   */
  async getMessageById(req, res) {
    try {
      const { id: messageId } = req.params;
      const user = req.user;

      // The message should already be attached by requireMessageAccess middleware
      if (req.message) {
        return res.json({
          success: true,
          data: req.message
        });
      }

      // Fallback if middleware didn't attach message
      const message = await messageService.getMessageById(messageId, user);

      res.json({
        success: true,
        data: message
      });

    } catch (error) {
      console.error('Error in getMessageById:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve message'
      });
    }
  }

  /**
   * Update message status (mark as read, change priority, close)
   * PUT /api/messages/:id/status
   */
  async updateMessageStatus(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { id: messageId } = req.params;
      const { status, priority } = req.body;
      const user = req.user;

      const updates = {};
      if (status) updates.status = status;
      if (priority) updates.priority = priority;

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No valid updates provided'
        });
      }

      const updatedMessage = await messageService.updateMessageStatus(
        messageId,
        updates,
        user
      );

      res.json({
        success: true,
        message: 'Message status updated successfully',
        data: updatedMessage
      });

    } catch (error) {
      console.error('Error in updateMessageStatus:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to update message status'
      });
    }
  }

  /**
   * Mark message as read
   * PUT /api/messages/:id/read
   */
  async markAsRead(req, res) {
    try {
      const { id: messageId } = req.params;
      const user = req.user;

      const updatedMessage = await messageService.markAsRead(messageId, user);

      res.json({
        success: true,
        message: 'Message marked as read',
        data: updatedMessage
      });

    } catch (error) {
      console.error('Error in markAsRead:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to mark message as read'
      });
    }
  }

  /**
   * Close a message
   * PUT /api/messages/:id/close
   */
  async closeMessage(req, res) {
    try {
      const { id: messageId } = req.params;
      const user = req.user;

      const updatedMessage = await messageService.closeMessage(messageId, user);

      res.json({
        success: true,
        message: 'Message closed successfully',
        data: updatedMessage
      });

    } catch (error) {
      console.error('Error in closeMessage:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to close message'
      });
    }
  }

  /**
   * Get conversation thread for a message
   * GET /api/messages/:id/thread
   */
  async getConversationThread(req, res) {
    try {
      const { id: messageId } = req.params;
      const user = req.user;

      const thread = await messageService.getConversationThread(messageId, user);

      res.json({
        success: true,
        data: thread,
        count: thread.length
      });

    } catch (error) {
      console.error('Error in getConversationThread:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve conversation thread'
      });
    }
  }

  /**
   * Get message statistics for dashboard
   * GET /api/messages/stats
   */
  async getMessageStats(req, res) {
    try {
      const user = req.user;
      const messageContext = req.messageContext;

      const stats = await messageService.getMessageStats(user, messageContext);

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error in getMessageStats:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to retrieve message statistics'
      });
    }
  }

  /**
   * Search messages with advanced filters
   * GET /api/messages/search
   */
  async searchMessages(req, res) {
    try {
      const user = req.user;
      const messageContext = req.messageContext;
      
      const {
        q: searchQuery = '',
        page = 1,
        limit = 20,
        status,
        priority,
        messageType,
        dateFrom,
        dateTo,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = req.query;

      // Validate pagination
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit)));

      const filters = {
        status,
        priority,
        messageType,
        dateFrom,
        dateTo
      };

      // Remove undefined filters
      Object.keys(filters).forEach(key => {
        if (filters[key] === undefined || filters[key] === '') {
          delete filters[key];
        }
      });

      const options = {
        page: pageNum,
        limit: limitNum,
        sortBy,
        sortOrder
      };

      const result = await messageService.searchMessages(
        searchQuery,
        user,
        messageContext,
        filters,
        options
      );

      res.json({
        success: true,
        data: result.messages,
        searchQuery: result.searchQuery,
        filters: result.filters,
        pagination: result.pagination
      });

    } catch (error) {
      console.error('Error in searchMessages:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to search messages'
      });
    }
  }

  /**
   * Get unread message count
   * GET /api/messages/unread-count
   */
  async getUnreadCount(req, res) {
    try {
      const user = req.user;
      const messageContext = req.messageContext;

      const count = await messageService.getUnreadCount(user, messageContext);

      res.json({
        success: true,
        data: { unreadCount: count }
      });

    } catch (error) {
      console.error('Error in getUnreadCount:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to get unread count'
      });
    }
  }

  /**
   * Delete a message (Admin only)
   * DELETE /api/messages/:id
   */
  async deleteMessage(req, res) {
    try {
      const { id: messageId } = req.params;
      const user = req.user;

      const result = await messageService.deleteMessage(messageId, user);

      res.json({
        success: true,
        message: 'Message deleted successfully',
        data: result
      });

    } catch (error) {
      console.error('Error in deleteMessage:', error);
      
      // Handle specific permission errors
      if (error.message.includes('Insufficient permissions')) {
        return res.status(403).json({
          success: false,
          error: error.message
        });
      }

      res.status(500).json({
        success: false,
        error: error.message || 'Failed to delete message'
      });
    }
  }

  /**
   * Bulk operations on messages (Admin/Assistant only)
   * POST /api/messages/bulk
   */
  async bulkOperations(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: errors.array()
        });
      }

      const { messageIds, operation, data } = req.body;
      const user = req.user;

      if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Message IDs array is required'
        });
      }

      let results = [];

      switch (operation) {
        case 'markAsRead':
          for (const messageId of messageIds) {
            try {
              const message = await messageService.markAsRead(messageId, user);
              results.push({ messageId, success: true, data: message });
            } catch (error) {
              results.push({ messageId, success: false, error: error.message });
            }
          }
          break;

        case 'updateStatus':
          if (!data || !data.status) {
            return res.status(400).json({
              success: false,
              error: 'Status data is required for bulk status update'
            });
          }
          
          for (const messageId of messageIds) {
            try {
              const message = await messageService.updateMessageStatus(
                messageId,
                { status: data.status },
                user
              );
              results.push({ messageId, success: true, data: message });
            } catch (error) {
              results.push({ messageId, success: false, error: error.message });
            }
          }
          break;

        case 'close':
          for (const messageId of messageIds) {
            try {
              const message = await messageService.closeMessage(messageId, user);
              results.push({ messageId, success: true, data: message });
            } catch (error) {
              results.push({ messageId, success: false, error: error.message });
            }
          }
          break;

        default:
          return res.status(400).json({
            success: false,
            error: `Unsupported bulk operation: ${operation}`
          });
      }

      const successCount = results.filter(r => r.success).length;
      const failureCount = results.filter(r => !r.success).length;

      res.json({
        success: true,
        message: `Bulk operation completed. ${successCount} succeeded, ${failureCount} failed.`,
        data: {
          operation,
          totalProcessed: messageIds.length,
          successCount,
          failureCount,
          results
        }
      });

    } catch (error) {
      console.error('Error in bulkOperations:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Failed to perform bulk operations'
      });
    }
  }
}

// Export singleton instance
module.exports = new MessageController();