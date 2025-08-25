const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const passport = require('passport');
const connectDB = require('./config/database');
require('dotenv').config();

// Import JWT configuration
const { jwtStrategy } = require('./config/jwt');

// Import routes
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const userRoutes = require('./routes/users');
const adminRoutes = require('./routes/adminRoutes');
const assistantRoutes = require('./routes/assistantRoutes');
const orderRoutes = require('./routes/orders'); 
const customerOrderRoutes = require('./routes/customerOrderRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const messages = require('./routes/messages'); // Add message routes import

// Import middleware - FIXED: Import from correct path
const { authenticate } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Configure Passport JWT Strategy
passport.use(jwtStrategy);

// Initialize Passport
app.use(passport.initialize());

// Security Middleware
// Set security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - MOVED BEFORE RATE LIMITING
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      process.env.CLIENT_URL || 'http://localhost:5173',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5173',
      'https://customer-management-frontend-mu.vercel.app' // Vercel domain
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-Total-Count', 'X-Page-Count']
};

// Apply CORS BEFORE rate limiting
app.use(cors(corsOptions));

// Rate limiting - different limits for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip preflight requests (OPTIONS)
  skip: (req) => req.method === 'OPTIONS'
});

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // More lenient limits for development
  max: process.env.NODE_ENV === 'development' ? 50 : 10,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
    timestamp: new Date().toISOString()
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip preflight requests (OPTIONS)
  skip: (req) => req.method === 'OPTIONS'
});

// Apply general rate limiting (after CORS)
app.use(generalLimiter);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent parameter pollution
app.use(hpp({
  whitelist: ['sort', 'fields', 'page', 'limit', 'search', 'role', 'status']
}));

// Request logging middleware (for development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
    if (req.headers.authorization) {
      console.log('Authorization header present');
    }
    next();
  });
}

// API ROUTES

// Auth routes with stricter rate limiting
app.use('/api/auth', authLimiter, authRoutes);

// Protected customer routes - FIXED: Use 'auth' instead of 'requireAuth'
app.use('/api/customers', authenticate, customerRoutes);

// Protected user routes
app.use('/api/users', userRoutes);

// Protected order routes
app.use('/api/orders', authenticate, orderRoutes);

// Protected customer-orders routes
app.use('/api/customer-orders', authenticate, customerOrderRoutes);

// Protected invoice routes
app.use('/api/invoices', authenticate, invoiceRoutes);

// Protected message routes - Standard message routes
app.use('/api/messages', authenticate, messages);

// Protected dashboard routes
app.use('/api/admin-dashboard', authenticate, adminRoutes);
app.use('/api/assistant-dashboard', authenticate, assistantRoutes);

// Messages endpoints - FIXED: Mount to /api/messages for recent messages
app.use('/api/messages', authenticate, adminRoutes);

// System health endpoint - FIXED: Mount to /api/health
app.use('/api/health', authenticate, adminRoutes);

// Basic route for testing
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Customer Management System API is running!',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      auth: '/api/auth',
      customers: '/api/customers (requires authentication)',
      users: '/api/users (requires authentication)',
      orders: '/api/orders (requires authentication)',
      customerOrders: '/api/customer-orders (requires authentication)',
      invoices: '/api/invoices (requires authentication)',
      messages: '/api/messages (requires authentication)',
      // UPDATED ENDPOINTS
      statsCustomers: '/api/admin-dashboard/stats/customers (requires admin authentication) - Customer analytics',
      statsUsers: '/api/admin-dashboard/stats/users (requires admin authentication) - User analytics',
      messagesRecent: '/api/messages/recent (requires authentication) - Recent messages',
      systemHealth: '/api/health (requires authentication) - System health metrics'
    },
    dashboards: {
      admin: '/api/admin-dashboard (requires admin authentication)',
      assistant: '/api/assistant-dashboard (requires assistant authentication)'
    },
    environment: process.env.NODE_ENV || 'development',
    security: {
      cors: 'enabled',
      helmet: 'enabled',
      rateLimit: 'enabled',
      jwtAuth: 'configured'
    }
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  
  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      timestamp: new Date().toISOString()
    });
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }
  
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expired',
      timestamp: new Date().toISOString()
    });
  }
  
  // Default error response
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong!' 
      : err.message,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Handle 404 routes
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown handlers
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// ===== FIXED: START SERVER WITH PROPER DATABASE CONNECTION TIMING =====
const startServer = async () => {
  try {
    // STEP 1: Connect to database FIRST
    await connectDB();
    
    // STEP 2: Start server AFTER database is connected
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔒 JWT Authentication: ${process.env.JWT_SECRET ? 'Configured' : 'NOT CONFIGURED!'}`);
      console.log(`🌐 CORS Origin: ${process.env.CLIENT_URL || 'http://localhost:5173'}`);
      console.log(`📈 Fixed API Endpoints Available:`);
      console.log(`   - /api/admin-dashboard/stats/customers - Customer analytics`);
      console.log(`   - /api/admin-dashboard/stats/users - User analytics`);
      console.log(`   - /api/messages/recent - Recent messages`);
      console.log(`   - /api/health - System health metrics`);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = app;