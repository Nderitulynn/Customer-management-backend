const mongoose = require('mongoose');

// Report schema - main model for storing generated reports and their metadata
const reportSchema = new mongoose.Schema({
  // Report identification
  reportId: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substr(2, 5);
      return `RPT-${timestamp}-${random}`.toUpperCase();
    }
  },

  // Report configuration
  type: {
    type: String,
    required: true,
    enum: ['dashboard', 'summary', 'revenue', 'performance', 'activity', 'trends', 'metrics', 'custom', 'export'],
    index: true
  },

  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },

  description: {
    type: String,
    maxlength: 1000,
    trim: true
  },

  // Report parameters used for generation
  parameters: {
    dateRange: {
      startDate: {
        type: Date,
        required: true
      },
      endDate: {
        type: Date,
        required: true
      },
      period: {
        type: String,
        enum: ['7d', '30d', '90d', '6m', '1y', 'custom'],
        default: 'custom'
      }
    },
    filters: {
      status: [String],
      assistantId: [mongoose.Schema.Types.ObjectId],
      customerId: [mongoose.Schema.Types.ObjectId],
      orderIds: [mongoose.Schema.Types.ObjectId],
      tags: [String],
      minAmount: Number,
      maxAmount: Number,
      paymentStatus: [String]
    },
    groupBy: {
      type: String,
      enum: ['day', 'week', 'month', 'quarter', 'year', 'assistant', 'status', 'customer', 'none'],
      default: 'day'
    },
    metrics: [{
      type: String,
      enum: ['revenue', 'orders', 'customers', 'conversion', 'avgOrderValue', 'growth', 'performance', 'activity']
    }],
    timezone: {
      type: String,
      default: 'UTC'
    },
    sortBy: {
      field: String,
      order: {
        type: String,
        enum: ['asc', 'desc'],
        default: 'desc'
      }
    },
    limit: {
      type: Number,
      min: 1,
      max: 10000,
      default: 1000
    }
  },

  // Generated report data (stored as JSON)
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },

  // Report metadata
  metadata: {
    generatedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    executionTime: {
      type: Number, // in milliseconds
      min: 0
    },
    recordCount: {
      type: Number,
      min: 0,
      default: 0
    },
    dataSize: {
      type: Number, // in bytes
      min: 0
    },
    version: {
      type: String,
      default: '1.0.0'
    },
    tags: [String]
  },

  // Report status and lifecycle
  status: {
    type: String,
    enum: ['generating', 'completed', 'failed', 'expired', 'archived'],
    default: 'generating',
    index: true
  },

  error: {
    message: String,
    code: String,
    stack: String
  },

  // Export information (if applicable)
  export: {
    isExported: {
      type: Boolean,
      default: false
    },
    exportFormat: {
      type: String,
      enum: ['csv', 'excel', 'pdf', 'json'],
      required: function() {
        return this.export && this.export.isExported;
      }
    },
    exportPath: String,
    exportSize: Number,
    downloadCount: {
      type: Number,
      default: 0
    },
    expiresAt: Date
  },

  // Access control
  access: {
    isPublic: {
      type: Boolean,
      default: false
    },
    allowedUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    allowedRoles: [{
      type: String,
      enum: ['admin', 'assistant', 'manager', 'viewer']
    }]
  },

  // Caching information
  cache: {
    key: String,
    ttl: {
      type: Number, // in seconds
      default: 300
    },
    lastAccessed: Date,
    accessCount: {
      type: Number,
      default: 0
    }
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Report template schema for predefined report configurations
const reportTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },

  category: {
    type: String,
    required: true,
    enum: ['financial', 'operational', 'marketing', 'performance', 'analytics', 'custom'],
    index: true
  },

  description: {
    type: String,
    required: true,
    maxlength: 500
  },

  // Template configuration matching report parameters structure
  template: {
    type: {
      type: String,
      required: true,
      enum: ['dashboard', 'summary', 'revenue', 'performance', 'activity', 'trends', 'metrics', 'custom']
    },
    defaultParameters: {
      dateRange: {
        period: {
          type: String,
          enum: ['7d', '30d', '90d', '6m', '1y', 'custom'],
          default: '30d'
        }
      },
      filters: mongoose.Schema.Types.Mixed,
      groupBy: {
        type: String,
        enum: ['day', 'week', 'month', 'quarter', 'year', 'assistant', 'status', 'customer'],
        default: 'day'
      },
      metrics: [String],
      timezone: {
        type: String,
        default: 'UTC'
      }
    },
    visualization: {
      chartType: {
        type: String,
        enum: ['line', 'bar', 'pie', 'doughnut', 'area', 'scatter', 'table'],
        default: 'line'
      },
      layout: String,
      colors: [String]
    }
  },

  // Template metadata
  isSystemTemplate: {
    type: Boolean,
    default: false
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  usageCount: {
    type: Number,
    default: 0
  },

  rating: {
    type: Number,
    min: 1,
    max: 5,
    default: 5
  },

  tags: [String],

  status: {
    type: String,
    enum: ['active', 'inactive', 'deprecated'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Report export job schema for tracking export operations
const reportExportSchema = new mongoose.Schema({
  exportId: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return `EXP-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
    }
  },

  reportId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Report',
    required: true
  },

  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  format: {
    type: String,
    required: true,
    enum: ['csv', 'excel', 'pdf', 'json']
  },

  status: {
    type: String,
    enum: ['queued', 'processing', 'completed', 'failed', 'expired'],
    default: 'queued',
    index: true
  },

  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },

  filePath: String,
  fileName: String,
  fileSize: Number,

  downloadCount: {
    type: Number,
    default: 0
  },

  expiresAt: {
    type: Date,
    default: function() {
      // Exports expire after 24 hours
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  },

  error: {
    message: String,
    code: String
  },

  processingTime: Number, // in milliseconds

  metadata: {
    estimatedSize: Number,
    actualSize: Number,
    recordCount: Number
  }
}, {
  timestamps: true
});

// Indexes for performance optimization
reportSchema.index({ type: 1, status: 1 });
reportSchema.index({ 'metadata.generatedBy': 1 });
reportSchema.index({ 'metadata.generatedAt': -1 });
reportSchema.index({ 'parameters.dateRange.startDate': 1, 'parameters.dateRange.endDate': 1 });
reportSchema.index({ 'cache.key': 1 }, { sparse: true });
reportSchema.index({ createdAt: -1 });

reportTemplateSchema.index({ category: 1, status: 1 });
reportTemplateSchema.index({ isSystemTemplate: 1 });
reportTemplateSchema.index({ usageCount: -1 });

reportExportSchema.index({ status: 1, expiresAt: 1 });
reportExportSchema.index({ requestedBy: 1 });
reportExportSchema.index({ createdAt: -1 });

// Virtual fields
reportSchema.virtual('isExpired').get(function() {
  if (!this.export || !this.export.expiresAt) return false;
  return this.export.expiresAt < new Date();
});

reportSchema.virtual('dataObjectSize').get(function() {
  if (!this.data) return 0;
  return JSON.stringify(this.data).length;
});

// Instance methods
reportSchema.methods.canUserAccess = function(user) {
  if (!user) return false;
  
  // Creator can always access
  if (this.metadata.generatedBy.toString() === user._id.toString()) return true;
  
  // Admin can access all reports
  if (user.role === 'admin') return true;
  
  // Check public access
  if (this.access.isPublic) return true;
  
  // Check allowed users
  if (this.access.allowedUsers && this.access.allowedUsers.some(userId => 
    userId.toString() === user._id.toString())) return true;
  
  // Check allowed roles
  if (this.access.allowedRoles && this.access.allowedRoles.includes(user.role)) return true;
  
  return false;
};

reportSchema.methods.incrementAccessCount = function() {
  if (this.cache) {
    this.cache.accessCount = (this.cache.accessCount || 0) + 1;
    this.cache.lastAccessed = new Date();
    return this.save();
  }
  return Promise.resolve(this);
};

reportSchema.methods.markAsExported = function(exportInfo) {
  this.export = {
    isExported: true,
    exportFormat: exportInfo.format,
    exportPath: exportInfo.path,
    exportSize: exportInfo.size,
    downloadCount: 0,
    expiresAt: exportInfo.expiresAt
  };
  return this.save();
};

reportTemplateSchema.methods.incrementUsage = function() {
  this.usageCount += 1;
  return this.save();
};

reportExportSchema.methods.updateProgress = function(progress, status) {
  this.progress = progress;
  if (status) this.status = status;
  return this.save();
};

reportExportSchema.methods.markCompleted = function(fileInfo) {
  this.status = 'completed';
  this.progress = 100;
  this.filePath = fileInfo.path;
  this.fileName = fileInfo.name;
  this.fileSize = fileInfo.size;
  this.processingTime = Date.now() - this.createdAt.getTime();
  return this.save();
};

reportExportSchema.methods.incrementDownloadCount = function() {
  this.downloadCount += 1;
  return this.save();
};

// Static methods
reportSchema.statics.findByUser = function(userId, filters = {}) {
  const query = {
    $or: [
      { 'metadata.generatedBy': userId },
      { 'access.isPublic': true },
      { 'access.allowedUsers': userId }
    ],
    status: { $ne: 'expired' }
  };
  
  if (filters.type) query.type = filters.type;
  if (filters.status) query.status = filters.status;
  
  return this.find(query)
    .populate('metadata.generatedBy', 'firstName lastName email')
    .sort({ 'metadata.generatedAt': -1 });
};

reportSchema.statics.findCached = function(cacheKey) {
  return this.findOne({ 
    'cache.key': cacheKey, 
    status: 'completed',
    'cache.lastAccessed': { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
  });
};

reportTemplateSchema.statics.findByCategory = function(category) {
  return this.find({ 
    category, 
    status: 'active' 
  }).sort({ usageCount: -1, name: 1 });
};

reportExportSchema.statics.findByUser = function(userId) {
  return this.find({ requestedBy: userId })
    .populate('reportId', 'type title')
    .sort({ createdAt: -1 });
};

reportExportSchema.statics.cleanupExpired = function() {
  return this.deleteMany({ 
    expiresAt: { $lt: new Date() },
    status: { $in: ['completed', 'failed'] }
  });
};

// Pre-save middleware
reportSchema.pre('save', function(next) {
  if (this.data) {
    this.metadata.dataSize = JSON.stringify(this.data).length;
    
    // Count records if data is an array or has a data property that's an array
    if (Array.isArray(this.data)) {
      this.metadata.recordCount = this.data.length;
    } else if (this.data.data && Array.isArray(this.data.data)) {
      this.metadata.recordCount = this.data.data.length;
    } else if (this.data.results && Array.isArray(this.data.results)) {
      this.metadata.recordCount = this.data.results.length;
    }
  }
  next();
});

// Create models
const Report = mongoose.model('Report', reportSchema);
const ReportTemplate = mongoose.model('ReportTemplate', reportTemplateSchema);
const ReportExport = mongoose.model('ReportExport', reportExportSchema);

module.exports = {
  Report,
  ReportTemplate,
  ReportExport
};