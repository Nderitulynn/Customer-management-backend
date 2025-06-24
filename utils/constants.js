// User roles and permissions
export const USER_ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant'
};

export const PERMISSIONS = {
  [USER_ROLES.ADMIN]: ['read', 'write', 'delete', 'manage_users'],
  [USER_ROLES.ASSISTANT]: ['read', 'write']
};

// Order statuses
export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Notification types and priorities
export const NOTIFICATION_TYPES = {
  ORDER_UPDATE: 'order_update',
  SYSTEM_ALERT: 'system_alert',
  USER_MESSAGE: 'user_message'
};

export const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// API response codes and messages
export const API_RESPONSES = {
  SUCCESS: {
    code: 200,
    message: 'Success'
  },
  CREATED: {
    code: 201,
    message: 'Created successfully'
  },
  BAD_REQUEST: {
    code: 400,
    message: 'Bad request'
  },
  UNAUTHORIZED: {
    code: 401,
    message: 'Unauthorized access'
  },
  FORBIDDEN: {
    code: 403,
    message: 'Access forbidden'
  },
  NOT_FOUND: {
    code: 404,
    message: 'Resource not found'
  },
  SERVER_ERROR: {
    code: 500,
    message: 'Internal server error'
  }
};

// WhatsApp message statuses
export const WHATSAPP_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed'
};

// Default values
export const DEFAULTS = {
  PAGE_SIZE: 20,
  MAX_RETRY_ATTEMPTS: 3,
  SESSION_TIMEOUT: 3600000 // 1 hour in milliseconds
};