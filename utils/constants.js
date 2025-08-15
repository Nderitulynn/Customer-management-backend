// utils/constants.js - Single source of truth for all system constants

// ===== SECURITY & PERMISSIONS =====

// User roles - only admin and assistant as per requirements
const USER_ROLES = {
  ADMIN: 'admin',
  ASSISTANT: 'assistant'
};

// CRUD operations
const OPERATIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  SEARCH: 'search'
};

// System entities
const ENTITIES = {
  CUSTOMERS: 'customers',
  ORDERS: 'orders',
  USERS: 'users',
  FINANCIAL_DATA: 'financial_data'
};

// Specific permissions that match your requirements
const SPECIFIC_PERMISSIONS = {
  // Customer permissions
  CREATE_CUSTOMERS: 'create_customers',
  VIEW_CUSTOMERS: 'view_customers',
  UPDATE_CUSTOMERS: 'update_customers',
  DELETE_CUSTOMERS: 'delete_customers',
  
  // Order permissions
  CREATE_ORDERS: 'create_orders',
  VIEW_ORDERS: 'view_orders',
  UPDATE_ORDERS: 'update_orders',
  DELETE_ORDERS: 'delete_orders',
  
  // User management (admin only)
  CREATE_USERS: 'create_users',
  VIEW_USERS: 'view_users',
  UPDATE_USERS: 'update_users',
  DELETE_USERS: 'delete_users',
  
  // Financial data (admin only)
  VIEW_FINANCIAL_DATA: 'view_financial_data',
  
  // System operations
  VIEW_REPORTS: 'view_reports',
  EXPORT_DATA: 'export_data'
};

// Role-based permissions that enforce your requirements
const PERMISSIONS = {
  [USER_ROLES.ADMIN]: [
    // Full access to everything
    ...Object.values(SPECIFIC_PERMISSIONS)
  ],
  [USER_ROLES.ASSISTANT]: [
    // Limited access based on your requirements:
    // - Can create/update customers but NOT delete
    SPECIFIC_PERMISSIONS.CREATE_CUSTOMERS,
    SPECIFIC_PERMISSIONS.VIEW_CUSTOMERS,
    SPECIFIC_PERMISSIONS.UPDATE_CUSTOMERS,
    // NOTE: NO DELETE_CUSTOMERS
    
    // - Can create/update orders but NOT delete
    SPECIFIC_PERMISSIONS.CREATE_ORDERS,
    SPECIFIC_PERMISSIONS.VIEW_ORDERS,
    SPECIFIC_PERMISSIONS.UPDATE_ORDERS,
    // NOTE: NO DELETE_ORDERS
    
    // - Can view reports
    SPECIFIC_PERMISSIONS.VIEW_REPORTS,
    
    // NOTE: NO user management permissions
    // NOTE: NO financial data permissions
  ]
};

// Financial data fields that should be hidden from assistants
const FINANCIAL_FIELDS = [
  'creditLimit',
  'paymentTerms',
  'balance',
  'revenue',
  'totalSpent',
  'outstandingBalance',
  'creditScore',
  'paymentHistory',
  'accountBalance',
  'creditRating',
  'paymentStatus',
  'invoiceAmount',
  'totalRevenue'
];

// ===== BUSINESS LOGIC CONSTANTS =====

// Order statuses
const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Notification types and priorities
const NOTIFICATION_TYPES = {
  ORDER_UPDATE: 'order_update',
  SYSTEM_ALERT: 'system_alert',
  USER_MESSAGE: 'user_message',
  SECURITY_ALERT: 'security_alert', // Added for security events
  PERMISSION_DENIED: 'permission_denied' // Added for access violations
};

const NOTIFICATION_PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
};

// WhatsApp message statuses
const WHATSAPP_STATUS = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  READ: 'read',
  FAILED: 'failed'
};

// ===== API RESPONSES =====

// Enhanced API response codes and messages
const API_RESPONSES = {
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

// Specific error messages for security
const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Authentication required',
  FORBIDDEN: 'Insufficient permissions',
  INVALID_TOKEN: 'Invalid or expired token',
  USER_NOT_FOUND: 'User not found',
  ACCOUNT_INACTIVE: 'Account has been deactivated',
  ADMIN_REQUIRED: 'Admin access required',
  ADMIN_ONLY_OPERATION: 'This operation requires administrator privileges',
  OWNERSHIP_REQUIRED: 'You can only access your own resources',
  OWNERSHIP_VIOLATION: 'You can only access your own resources',
  ACCESS_DENIED: 'Access denied',
  DELETE_DENIED: 'You do not have permission to delete resources',
  FINANCIAL_ACCESS_DENIED: 'Access to financial data is restricted',
  DELETE_PERMISSION_DENIED: 'You do not have permission to delete resources',
  USER_REGISTRATION_DENIED: 'Only administrators can register new users'
};

// Success messages
const SUCCESS_MESSAGES = {
  CREATED: 'Resource created successfully',
  UPDATED: 'Resource updated successfully',
  DELETED: 'Resource deleted successfully',
  RETRIEVED: 'Resource retrieved successfully'
};

// ===== SYSTEM CONFIGURATION =====

// Default values - merged with your existing ones
const DEFAULTS = {
  PAGE_SIZE: 20,
  MAX_RETRY_ATTEMPTS: 3,
  SESSION_TIMEOUT: 3600000, // 1 hour in milliseconds
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
  DEFAULT_PAGE: 1
};

// Validation rules
const VALIDATION_RULES = {
  PASSWORD_MIN_LENGTH: 8,
  USERNAME_MIN_LENGTH: 3,
  EMAIL_REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE_REGEX: /^[\+]?[1-9][\d]{0,15}$/,
  MAX_CREDIT_LIMIT: 1000000,
  PAYMENT_TERMS: ['net30', 'net60', 'net90', 'immediate'],
  MAX_ITEM_QUANTITY: 1000,
  ADMIN_MAX_ITEM_PRICE: 100000,
  ASSISTANT_MAX_ITEM_PRICE: 10000,
  ADMIN_MAX_ORDER_VALUE: 500000,
  ASSISTANT_MAX_ORDER_VALUE: 50000
};

// Database field names
const DB_FIELDS = {
  CREATED_BY: 'createdBy',
  UPDATED_BY: 'updatedBy',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  IS_ACTIVE: 'isActive'
};

// ===== AUDIT & LOGGING =====

// Audit log levels
const AUDIT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Security event types
const SECURITY_EVENTS = {
  LOGIN_SUCCESS: 'login_success',
  LOGIN_FAILED: 'login_failed',
  UNAUTHORIZED_ACCESS: 'unauthorized_access',
  PERMISSION_DENIED: 'permission_denied',
  FINANCIAL_DATA_ACCESS: 'financial_data_access',
  ADMIN_ACTION: 'admin_action',
  USER_CREATED: 'user_created',
  USER_DELETED: 'user_deleted'
};

module.exports = {
  // Security & Permissions
  USER_ROLES,
  OPERATIONS,
  ENTITIES,
  SPECIFIC_PERMISSIONS,
  PERMISSIONS,
  FINANCIAL_FIELDS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES,
  
  // Business Logic
  ORDER_STATUS,
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITY,
  WHATSAPP_STATUS,
  
  // API & Responses
  API_RESPONSES,
  
  // System Configuration
  DEFAULTS,
  VALIDATION_RULES,
  DB_FIELDS,
  
  // Audit & Security
  AUDIT_LEVELS,
  SECURITY_EVENTS
};