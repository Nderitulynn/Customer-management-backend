const Message = require('../models/Message');
const Customer = require('../models/Customer');
const User = require('../models/User');
const { ROLES } = require('../middleware/auth');

class MessageService {
  /**
   * Create a new message
   * @param {Object} messageData - Message creation data
   * @param {Object} user - Current user (customer creating the message)
   * @param {Object} customerContext - Customer context from middleware
   * @returns {Object} Created message with populated references
   */
  async createMessage({ subject, content, priority = 'medium' }, user, customerContext) {
    try {
      // Validate input
      if (!subject || !content) {
        throw new Error('Subject and content are required');
      }

      if (!customerContext || !customerContext.customerId || !customerContext.assignedTo) {
        throw new Error('Invalid customer context or no assigned assistant');
      }

      // Create message with customer and assistant references
      const messageData = {
        customerId: customerContext.customerId,
        assignedTo: customerContext.assignedTo,
        subject: subject.trim(),
        content: content.trim(),
        priority,
        status: 'unread',
        messageType: 'initial'
      };

      const message = new Message(messageData);
      await message.save();

      // Return populated message
      return await Message.findById(message._id)
        .populate('customerId', 'name email phone')
        .populate('assignedTo', 'username email');

    } catch (error) {
      console.error('Error creating message:', error);
      throw error;
    }
  }

  /**
   * Reply to an existing message
   * @param {String} parentMessageId - ID of message being replied to
   * @param {Object} replyData - Reply content and metadata
   * @param {Object} user - Current user (customer or assistant)
   * @returns {Object} Created reply message
   */
  async replyToMessage(parentMessageId, { content, priority }, user) {
    try {
      if (!content || content.trim().length === 0) {
        throw new Error('Reply content is required');
      }

      // Find parent message with populated references
      const parentMessage = await Message.findById(parentMessageId)
        .populate('customerId', '_id assignedTo');

      if (!parentMessage) {
        throw new Error('Parent message not found');
      }

      // Validate user can reply to this message
      await this.validateMessageAccess(parentMessage, user);

      // Determine reply metadata
      const isCustomerReply = user.role === ROLES.CUSTOMER;
      const replyData = {
        customerId: parentMessage.customerId._id,
        assignedTo: parentMessage.assignedTo,
        subject: `Re: ${parentMessage.subject}`,
        content: content.trim(),
        priority: priority || parentMessage.priority,
        status: 'unread',
        messageType: 'reply',
        parentMessageId: parentMessageId
      };

      // Create reply
      const reply = new Message(replyData);
      await reply.save();

      // Update parent message status if this is an assistant reply
      if (!isCustomerReply) {
        await Message.findByIdAndUpdate(parentMessageId, {
          status: 'replied',
          updatedAt: new Date()
        });
      }

      // Return populated reply
      return await Message.findById(reply._id)
        .populate('customerId', 'name email phone')
        .populate('assignedTo', 'username email');

    } catch (error) {
      console.error('Error replying to message:', error);
      throw error;
    }
  }

  /**
   * Get messages for a user based on their role and permissions
   * @param {Object} user - Current user
   * @param {Object} messageContext - Message context from middleware
   * @param {Object} options - Query options (pagination, filtering, sorting)
   * @returns {Object} Messages with metadata
   */
  async getMessages(user, messageContext, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status,
        priority,
        search,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        messageType
      } = options;

      // Build query from context and filters
      let query = { ...messageContext.filter };

      // Apply additional filters
      if (status) {
        query.status = status;
      }
      if (priority) {
        query.priority = priority;
      }
      if (messageType) {
        query.messageType = messageType;
      }

      // Handle search
      if (search && search.trim()) {
        query.$or = [
          { subject: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ];
      }

      // Calculate pagination
      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const [messages, totalCount] = await Promise.all([
        Message.find(query)
          .populate('customerId', 'name email phone')
          .populate('assignedTo', 'username email')
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit)
          .lean(),
        Message.countDocuments(query)
      ]);

      // Calculate pagination metadata
      const totalPages = Math.ceil(totalCount / limit);
      const hasMore = page < totalPages;

      return {
        messages,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasMore,
          limit
        },
        context: {
          role: user.role,
          scope: messageContext.scope
        }
      };

    } catch (error) {
      console.error('Error getting messages:', error);
      throw error;
    }
  }

  /**
   * Get a single message by ID with access validation
   * @param {String} messageId - Message ID
   * @param {Object} user - Current user
   * @returns {Object} Message with populated references
   */
  async getMessageById(messageId, user) {
    try {
      const message = await Message.findById(messageId)
        .populate('customerId', 'name email phone')
        .populate('assignedTo', 'username email');

      if (!message) {
        throw new Error('Message not found');
      }

      // Validate access (this should be done by middleware, but double-check)
      await this.validateMessageAccess(message, user);

      return message;
    } catch (error) {
      console.error('Error getting message by ID:', error);
      throw error;
    }
  }

  /**
   * Update message status (mark as read, change priority, close, etc.)
   * @param {String} messageId - Message ID
   * @param {Object} updates - Status updates
   * @param {Object} user - Current user
   * @returns {Object} Updated message
   */
  async updateMessageStatus(messageId, updates, user) {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Validate access
      await this.validateMessageAccess(message, user);

      // Prepare update object
      const updateData = { updatedAt: new Date() };

      // Handle specific status updates
      if (updates.status) {
        updateData.status = updates.status;
        
        // Set readAt timestamp when marking as read
        if (updates.status === 'read' && message.status === 'unread') {
          updateData.readAt = new Date();
        }
      }

      if (updates.priority) {
        updateData.priority = updates.priority;
      }

      // Update message
      const updatedMessage = await Message.findByIdAndUpdate(
        messageId,
        updateData,
        { new: true }
      ).populate('customerId', 'name email phone')
       .populate('assignedTo', 'username email');

      return updatedMessage;

    } catch (error) {
      console.error('Error updating message status:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   * @param {String} messageId - Message ID
   * @param {Object} user - Current user
   * @returns {Object} Updated message
   */
  async markAsRead(messageId, user) {
    return this.updateMessageStatus(messageId, { status: 'read' }, user);
  }

  /**
   * Close a message
   * @param {String} messageId - Message ID
   * @param {Object} user - Current user
   * @returns {Object} Updated message
   */
  async closeMessage(messageId, user) {
    return this.updateMessageStatus(messageId, { status: 'closed' }, user);
  }

  /**
   * Get conversation thread for a message
   * @param {String} messageId - Initial message ID
   * @param {Object} user - Current user
   * @returns {Array} Array of messages in conversation thread
   */
  async getConversationThread(messageId, user) {
    try {
      const initialMessage = await Message.findById(messageId);
      if (!initialMessage) {
        throw new Error('Message not found');
      }

      // Validate access to initial message
      await this.validateMessageAccess(initialMessage, user);

      // Find all messages in the thread (initial + replies)
      const threadMessages = await Message.find({
        $or: [
          { _id: messageId },
          { parentMessageId: messageId }
        ]
      })
      .populate('customerId', 'name email phone')
      .populate('assignedTo', 'username email')
      .sort({ createdAt: 1 });

      return threadMessages;

    } catch (error) {
      console.error('Error getting conversation thread:', error);
      throw error;
    }
  }

  /**
   * Get message statistics for user dashboard
   * @param {Object} user - Current user
   * @param {Object} messageContext - Message context from middleware
   * @returns {Object} Message statistics
   */
  async getMessageStats(user, messageContext) {
    try {
      const baseQuery = messageContext.filter;

      // Get basic counts
      const [
        totalMessages,
        unreadMessages,
        repliedMessages,
        closedMessages
      ] = await Promise.all([
        Message.countDocuments(baseQuery),
        Message.countDocuments({ ...baseQuery, status: 'unread' }),
        Message.countDocuments({ ...baseQuery, status: 'replied' }),
        Message.countDocuments({ ...baseQuery, status: 'closed' })
      ]);

      // Get priority breakdown
      const priorityStats = await Message.aggregate([
        { $match: baseQuery },
        {
          $group: {
            _id: '$priority',
            count: { $sum: 1 }
          }
        }
      ]);

      // Get recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const recentActivity = await Message.countDocuments({
        ...baseQuery,
        createdAt: { $gte: sevenDaysAgo }
      });

      // Format priority stats
      const priorityBreakdown = {
        low: 0,
        medium: 0,
        high: 0
      };
      
      priorityStats.forEach(stat => {
        priorityBreakdown[stat._id] = stat.count;
      });

      return {
        total: totalMessages,
        unread: unreadMessages,
        replied: repliedMessages,
        closed: closedMessages,
        recentActivity,
        priorityBreakdown,
        context: {
          role: user.role,
          scope: messageContext.scope
        }
      };

    } catch (error) {
      console.error('Error getting message stats:', error);
      throw error;
    }
  }

  /**
   * Advanced message search with filters
   * @param {String} searchQuery - Search text
   * @param {Object} user - Current user
   * @param {Object} messageContext - Message context from middleware
   * @param {Object} filters - Additional search filters
   * @param {Object} options - Pagination and sorting options
   * @returns {Object} Search results with metadata
   */
  async searchMessages(searchQuery, user, messageContext, filters = {}, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        sortBy = 'createdAt',
        sortOrder = 'desc'
      } = options;

      // Build search query
      let query = { ...messageContext.filter };

      // Add text search if provided
      if (searchQuery && searchQuery.trim()) {
        query.$or = [
          { subject: { $regex: searchQuery, $options: 'i' } },
          { content: { $regex: searchQuery, $options: 'i' } }
        ];
      }

      // Apply additional filters
      if (filters.status) {
        query.status = filters.status;
      }
      if (filters.priority) {
        query.priority = filters.priority;
      }
      if (filters.messageType) {
        query.messageType = filters.messageType;
      }
      if (filters.dateFrom) {
        query.createdAt = { ...query.createdAt, $gte: new Date(filters.dateFrom) };
      }
      if (filters.dateTo) {
        query.createdAt = { ...query.createdAt, $lte: new Date(filters.dateTo) };
      }

      // Execute search with pagination
      const skip = (page - 1) * limit;
      const sortDirection = sortOrder === 'desc' ? -1 : 1;

      const [messages, totalCount] = await Promise.all([
        Message.find(query)
          .populate('customerId', 'name email phone')
          .populate('assignedTo', 'username email')
          .sort({ [sortBy]: sortDirection })
          .skip(skip)
          .limit(limit),
        Message.countDocuments(query)
      ]);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        messages,
        searchQuery,
        filters,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount,
          hasMore: page < totalPages,
          limit
        }
      };

    } catch (error) {
      console.error('Error searching messages:', error);
      throw error;
    }
  }

  /**
   * Delete a message (admin only)
   * @param {String} messageId - Message ID
   * @param {Object} user - Current user (must be admin)
   * @returns {Object} Deletion result
   */
  async deleteMessage(messageId, user) {
    try {
      // Only admins can delete messages
      if (user.role !== ROLES.ADMIN) {
        throw new Error('Insufficient permissions to delete messages');
      }

      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message not found');
      }

      // Delete message and any replies
      const deletionResult = await Promise.all([
        Message.deleteOne({ _id: messageId }),
        Message.deleteMany({ parentMessageId: messageId })
      ]);

      return {
        success: true,
        deletedMessage: deletionResult[0].deletedCount > 0,
        deletedReplies: deletionResult[1].deletedCount
      };

    } catch (error) {
      console.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Validate if user has access to a specific message
   * @param {Object} message - Message object
   * @param {Object} user - Current user
   * @throws {Error} If access is denied
   */
  async validateMessageAccess(message, user) {
    if (user.role === ROLES.ADMIN) {
      return true; // Admins have access to all messages
    }

    if (user.role === ROLES.CUSTOMER) {
      // Customers can only access their own messages
      if (!user.customerProfile || 
          message.customerId.toString() !== user.customerProfile.toString()) {
        throw new Error('Access denied - you can only access your own messages');
      }
    } else if (user.role === ROLES.ASSISTANT) {
      // Assistants can only access messages from their assigned customers
      const customer = await Customer.findById(message.customerId);
      if (!customer || !customer.assignedTo || 
          customer.assignedTo.toString() !== user._id.toString()) {
        throw new Error('Access denied - message not from your assigned customer');
      }
    }

    return true;
  }

  /**
   * Get unread message count for user
   * @param {Object} user - Current user
   * @param {Object} messageContext - Message context from middleware
   * @returns {Number} Unread message count
   */
  async getUnreadCount(user, messageContext) {
    try {
      return await Message.countDocuments({
        ...messageContext.filter,
        status: 'unread'
      });
    } catch (error) {
      console.error('Error getting unread count:', error);
      throw error;
    }
  }
}

// Export singleton instance
module.exports = new MessageService();