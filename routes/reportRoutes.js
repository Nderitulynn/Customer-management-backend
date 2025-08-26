const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const { validateReportParams, validateExportParams } = require('../validators/reportValidators');
const rateLimit = require('express-rate-limit');

// Rate limiting for export operations (more restrictive)
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 export requests per windowMs
  message: {
    error: 'Too many export requests, please try again later.',
    code: 'EXPORT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general report requests
const reportLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 report requests per minute
  message: {
    error: 'Too many report requests, please try again later.',
    code: 'REPORT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * @route   GET /api/reports/dashboard
 * @desc    Get comprehensive dashboard report data
 * @access  Admin only
 * @params  startDate, endDate, period, timezone
 */
router.get('/dashboard', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getDashboardReports
);

/**
 * @route   GET /api/reports/summary
 * @desc    Get summary statistics and KPIs
 * @access  Admin only
 * @params  startDate, endDate, period, timezone
 */
router.get('/summary', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getSummaryStats
);

/**
 * @route   GET /api/reports/revenue
 * @desc    Get detailed revenue analytics
 * @access  Admin only
 * @params  startDate, endDate, period, timezone, groupBy
 */
router.get('/revenue', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getRevenueReports
);

/**
 * @route   GET /api/reports/performance
 * @desc    Get assistant and system performance metrics
 * @access  Admin only
 * @params  startDate, endDate, period, timezone, assistantId
 */
router.get('/performance', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getPerformanceReports
);

/**
 * @route   GET /api/reports/activity
 * @desc    Get recent activity and operational data
 * @access  Admin only
 * @params  startDate, endDate, limit, offset
 */
router.get('/activity', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getActivityReports
);

/**
 * @route   GET /api/reports/trends/:type
 * @desc    Get trend data for specific metrics
 * @access  Admin only
 * @params  type (revenue|customers|orders|assistants), startDate, endDate, interval
 */
router.get('/trends/:type', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getTrendData
);

/**
 * @route   GET /api/reports/metrics
 * @desc    Get calculated business metrics and ratios
 * @access  Admin only
 * @params  startDate, endDate, period, timezone
 */
router.get('/metrics', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.getBusinessMetrics
);

/**
 * @route   POST /api/reports/export
 * @desc    Export report data in various formats
 * @access  Admin only
 * @body    reportType, format, startDate, endDate, filters
 */
router.post('/export', 
  exportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateExportParams,
  reportController.exportReport
);

/**
 * @route   POST /api/reports/custom
 * @desc    Generate custom reports with advanced filtering
 * @access  Admin only
 * @body    reportConfig, filters, groupBy, metrics
 */
router.post('/custom', 
  reportLimiter,
  authenticateToken, 
  requireAdmin, 
  validateReportParams,
  reportController.generateCustomReport
);

/**
 * @route   GET /api/reports/filters
 * @desc    Get available filter options and configurations
 * @access  Admin only
 */
router.get('/filters', 
  authenticateToken, 
  requireAdmin, 
  reportController.getFilterOptions
);

/**
 * @route   GET /api/reports/status/:exportId
 * @desc    Check status of long-running export operations
 * @access  Admin only
 * @params  exportId
 */
router.get('/status/:exportId', 
  authenticateToken, 
  requireAdmin, 
  reportController.getExportStatus
);

/**
 * @route   GET /api/reports/download/:exportId
 * @desc    Download completed export file
 * @access  Admin only
 * @params  exportId
 */
router.get('/download/:exportId', 
  authenticateToken, 
  requireAdmin, 
  reportController.downloadExport
);

/**
 * @route   DELETE /api/reports/export/:exportId
 * @desc    Delete export file and cleanup
 * @access  Admin only
 * @params  exportId
 */
router.delete('/export/:exportId', 
  authenticateToken, 
  requireAdmin, 
  reportController.deleteExport
);

/**
 * @route   GET /api/reports/cache/clear
 * @desc    Clear report cache (for debugging/maintenance)
 * @access  Admin only
 */
router.get('/cache/clear', 
  authenticateToken, 
  requireAdmin, 
  reportController.clearReportCache
);

/**
 * @route   GET /api/reports/health
 * @desc    Health check for report system
 * @access  Admin only
 */
router.get('/health', 
  authenticateToken, 
  requireAdmin, 
  reportController.getReportSystemHealth
);

// Error handling middleware specific to reports
router.use((error, req, res, next) => {
  console.error('Report Route Error:', error);
  
  // Handle specific report errors
  if (error.code === 'INVALID_DATE_RANGE') {
    return res.status(400).json({
      success: false,
      error: 'Invalid date range provided',
      message: error.message,
      code: error.code
    });
  }
  
  if (error.code === 'EXPORT_TOO_LARGE') {
    return res.status(400).json({
      success: false,
      error: 'Export request too large',
      message: 'Please reduce the date range or add more filters',
      code: error.code
    });
  }
  
  if (error.code === 'REPORT_GENERATION_FAILED') {
    return res.status(500).json({
      success: false,
      error: 'Report generation failed',
      message: 'An error occurred while generating the report',
      code: error.code
    });
  }
  
  // Default error response
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred while processing your report request',
    code: 'INTERNAL_SERVER_ERROR'
  });
});

module.exports = router;