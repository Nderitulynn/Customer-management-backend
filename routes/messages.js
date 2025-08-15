const express = require('express');
const { body, param, query } = require('express-validator');
const messageController = require('../controllers/messageController');
const { 
  authenticate,
  requireCanCreateMessage,
  requireCanReadMessage,
  requireCanReplyMessage,
  requireCanUpdateMessage,
  requireCanDeleteMessage,
  requireCanMarkRead,
  requireCanCloseMessage,
  requireCanSearchMessages,
  requireCanViewMessageStats,
  requireAdmin
} = require('../middleware/auth');
const {
  requireMessageAccess,
  setMessageQueryContext,
  requireMessageCreationAccess,
  requireCustomerAccess,
  requireAssistantAccess
} = require('../middleware/messageAuth');

const router = express.Router();

// Validation middleware
const messageValidation = {
  // Create message validation
  createMessage: [
    body('subject')
      .notEmpty()
      .withMessage('Subject is required')
      .isLength({ min: 5, max: 200 })
      .withMessage('Subject must be between 5 and 200 characters')
      .trim()
      .escape(),
    body('content')
      .notEmpty()
      .withMessage('Content is required')
      .isLength({ min: 10, max: 5000 })
      .withMessage('Content must be between 10 and 5000 characters')
      .trim(),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be low, medium, or high')
  ],

  // Reply validation
  reply: [
    param('id')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('content')
      .notEmpty()
      .withMessage('Reply content is required')
      .isLength({ min: 1, max: 5000 })
      .withMessage('Reply content must be between 1 and 5000 characters')
      .trim(),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be low, medium, or high')
  ],

  // Status update validation
  updateStatus: [
    param('id')
      .isMongoId()
      .withMessage('Invalid message ID'),
    body('status')
      .optional()
      .isIn(['unread', 'read', 'replied', 'closed'])
      .withMessage('Status must be unread, read, replied, or closed'),
    body('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Priority must be low, medium, or high')
  ],

  // Message ID parameter validation
  messageId: [
    param('id')
      .isMongoId()
      .withMessage('Invalid message ID')
  ],

  // Search query validation
  search: [
    query('q')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Search query too long'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    query('status')
      .optional()
      .isIn(['unread', 'read', 'replied', 'closed'])
      .withMessage('Invalid status filter'),
    query('priority')
      .optional()
      .isIn(['low', 'medium', 'high'])
      .withMessage('Invalid priority filter'),
    query('messageType')
      .optional()
      .isIn(['initial', 'reply'])
      .withMessage('Invalid message type filter'),
    query('sortBy')
      .optional()
      .isIn(['createdAt', 'updatedAt', 'subject', 'priority', 'status'])
      .withMessage('Invalid sort field'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Sort order must be asc or desc')
  ],

  // Bulk operations validation
  bulkOperations: [
    body('messageIds')
      .isArray({ min: 1, max: 50 })
      .withMessage('MessageIds must be an array of 1-50 message IDs'),
    body('messageIds.*')
      .isMongoId()
      .withMessage('All message IDs must be valid MongoDB ObjectIds'),
    body('operation')
      .isIn(['markAsRead', 'updateStatus', 'close'])
      .withMessage('Operation must be markAsRead, updateStatus, or close'),
    body('data.status')
      .if(body('operation').equals('updateStatus'))
      .isIn(['unread', 'read', 'replied', 'closed'])
      .withMessage('Status must be provided for updateStatus operation')
  ]
};

// ============================================================================
// PUBLIC ROUTES (require authentication but role-based access in controllers)
// ============================================================================

/**
 * @route   GET /api/messages/stats
 * @desc    Get message statistics for dashboard
 * @access  Private (Customer, Assistant, Admin)
 */
router.get('/stats',
  authenticate,
  requireCanViewMessageStats(),
  setMessageQueryContext(),
  messageController.getMessageStats
);

/**
 * @route   GET /api/messages/unread-count
 * @desc    Get unread message count
 * @access  Private (Customer, Assistant, Admin)
 */
router.get('/unread-count',
  authenticate,
  requireCanReadMessage(),
  setMessageQueryContext(),
  messageController.getUnreadCount
);

/**
 * @route   GET /api/messages/search
 * @desc    Search messages with advanced filters
 * @access  Private (Customer, Assistant, Admin)
 */
router.get('/search',
  messageValidation.search,
  authenticate,
  requireCanSearchMessages(),
  setMessageQueryContext(),
  messageController.searchMessages
);

/**
 * @route   GET /api/messages
 * @desc    Get messages for current user (paginated)
 * @access  Private (Customer, Assistant, Admin)
 */
router.get('/',
  messageValidation.search, // Reuse search validation for query params
  authenticate,
  requireCanReadMessage(),
  setMessageQueryContext(),
  messageController.getMessages
);

/**
 * @route   POST /api/messages
 * @desc    Create new message
 * @access  Private (Customer, Admin)
 */
router.post('/',
  messageValidation.createMessage,
  authenticate,
  requireCanCreateMessage(),
  requireMessageCreationAccess(),
  messageController.createMessage
);

/**
 * @route   GET /api/messages/:id
 * @desc    Get specific message by ID
 * @access  Private (Customer - own messages, Assistant - assigned customers, Admin - all)
 */
router.get('/:id',
  messageValidation.messageId,
  authenticate,
  requireCanReadMessage(),
  requireMessageAccess(),
  messageController.getMessageById
);

/**
 * @route   POST /api/messages/:id/reply
 * @desc    Reply to existing message
 * @access  Private (Customer - own messages, Assistant - assigned customers, Admin - all)
 */
router.post('/:id/reply',
  messageValidation.reply,
  authenticate,
  requireCanReplyMessage(),
  requireMessageAccess(),
  messageController.replyToMessage
);

/**
 * @route   PUT /api/messages/:id/status
 * @desc    Update message status (read, priority, close)
 * @access  Private (Customer - own messages, Assistant - assigned customers, Admin - all)
 */
router.put('/:id/status',
  messageValidation.updateStatus,
  authenticate,
  requireCanUpdateMessage(),
  requireMessageAccess(),
  messageController.updateMessageStatus
);

/**
 * @route   PUT /api/messages/:id/read
 * @desc    Mark message as read
 * @access  Private (Customer - own messages, Assistant - assigned customers, Admin - all)
 */
router.put('/:id/read',
  messageValidation.messageId,
  authenticate,
  requireCanMarkRead(),
  requireMessageAccess(),
  messageController.markAsRead
);

/**
 * @route   PUT /api/messages/:id/close
 * @desc    Close a message
 * @access  Private (Assistant - assigned customers, Admin - all)
 */
router.put('/:id/close',
  messageValidation.messageId,
  authenticate,
  requireCanCloseMessage(),
  requireMessageAccess(),
  messageController.closeMessage
);

/**
 * @route   GET /api/messages/:id/thread
 * @desc    Get conversation thread for a message
 * @access  Private (Customer - own messages, Assistant - assigned customers, Admin - all)
 */
router.get('/:id/thread',
  messageValidation.messageId,
  authenticate,
  requireCanReadMessage(),
  requireMessageAccess(),
  messageController.getConversationThread
);

// ============================================================================
// ADMIN-ONLY ROUTES
// ============================================================================

/**
 * @route   DELETE /api/messages/:id
 * @desc    Delete message and all replies
 * @access  Private (Admin only)
 */
router.delete('/:id',
  messageValidation.messageId,
  authenticate,
  requireCanDeleteMessage(),
  requireAdmin(),
  messageController.deleteMessage
);

/**
 * @route   POST /api/messages/bulk
 * @desc    Bulk operations on messages
 * @access  Private (Assistant - assigned customers, Admin - all)
 */
router.post('/bulk',
  messageValidation.bulkOperations,
  authenticate,
  requireCanUpdateMessage(),
  setMessageQueryContext(),
  messageController.bulkOperations
);

// ============================================================================
// CUSTOMER-SPECIFIC ROUTES
// ============================================================================

/**
 * @route   GET /api/messages/customer/conversations
 * @desc    Get customer's message conversations (grouped by thread)
 * @access  Private (Customer only)
 */
router.get('/customer/conversations',
  authenticate,
  requireCanReadMessage(),
  requireCustomerAccess(),
  setMessageQueryContext(),
  async (req, res) => {
    try {
      // This could be implemented as a separate controller method
      // For now, redirect to regular messages endpoint
      req.query.messageType = 'initial'; // Only initial messages for conversations
      messageController.getMessages(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve conversations'
      });
    }
  }
);

// ============================================================================
// ASSISTANT-SPECIFIC ROUTES
// ============================================================================

/**
 * @route   GET /api/messages/assistant/assigned
 * @desc    Get messages from all assigned customers
 * @access  Private (Assistant only)
 */
router.get('/assistant/assigned',
  authenticate,
  requireCanReadMessage(),
  requireAssistantAccess(),
  setMessageQueryContext(),
  messageController.getMessages
);

/**
 * @route   GET /api/messages/assistant/priority/:priority
 * @desc    Get messages by priority for assistant
 * @access  Private (Assistant only)
 */
router.get('/assistant/priority/:priority',
  param('priority').isIn(['low', 'medium', 'high']).withMessage('Invalid priority'),
  authenticate,
  requireCanReadMessage(),
  requireAssistantAccess(),
  setMessageQueryContext(),
  async (req, res) => {
    try {
      req.query.priority = req.params.priority;
      messageController.getMessages(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve priority messages'
      });
    }
  }
);

/**
 * @route   GET /api/messages/assistant/unread
 * @desc    Get all unread messages for assistant
 * @access  Private (Assistant only)
 */
router.get('/assistant/unread',
  authenticate,
  requireCanReadMessage(),
  requireAssistantAccess(),
  setMessageQueryContext(),
  async (req, res) => {
    try {
      req.query.status = 'unread';
      messageController.getMessages(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve unread messages'
      });
    }
  }
);

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

// Route not found handler
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Error handler for this router
router.use((error, req, res, next) => {
  console.error('Message route error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error in message routes'
  });
});

module.exports = router;