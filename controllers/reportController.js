const ReportService = require('../services/reportService');
const { validateDateRange, formatResponse } = require('../utils/reportHelpers');

console.log('ReportService loaded:', typeof ReportService);
console.log('Available methods:', Object.getOwnPropertyNames(ReportService));

// Define constants locally
const REPORT_TYPES = {
  EXPORT: {
    DASHBOARD: 'dashboard',
    REVENUE: 'revenue',
    PERFORMANCE: 'performance',
    ACTIVITY: 'activity'
  },
  TRENDS: {
    REVENUE: 'revenue',
    CUSTOMERS: 'customers', 
    ORDERS: 'orders',
    ASSISTANTS: 'assistants'
  }
};

const EXPORT_FORMATS = {
  CSV: 'csv',
  XLSX: 'xlsx',
  JSON: 'json',
  PDF: 'pdf'
};


  /**
   * Get comprehensive dashboard report data
   * @route GET /api/reports/dashboard
   */
 const getDashboardReports = async (req, res) => {
    try {
      const { startDate, endDate, period, timezone = 'UTC' } = req.query;
      
      // Validate and parse date range
      const dateRange = validateDateRange(startDate, endDate, period);
      
      // Generate fresh report data
      const [summary, trends, orderMetrics, assistantMetrics, recentActivity] = await Promise.all([
        ReportService.getSummaryStats(dateRange, timezone),
        ReportService.getTrendData(dateRange, timezone),
        ReportService.getOrderMetrics(dateRange, timezone),
        ReportService.getAssistantMetrics(dateRange, timezone),
        ReportService.getRecentActivity(dateRange, timezone)
      ]);
      
      const reportData = {
        summary,
        trends,
        orderMetrics,
        assistantMetrics,
        recentActivity,
        metadata: {
          generatedAt: new Date().toISOString(),
          dateRange,
          timezone
        }
      };
      
      res.json(formatResponse(true, reportData, 'Dashboard reports retrieved successfully'));
    } catch (error) {
      console.error('Dashboard Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate dashboard reports', error.message));
    };
  };

  /**
   * Get detailed revenue analytics
   * @route GET /api/reports/revenue
   */
    const getRevenueReports = async (req, res) => {
    try {
      const { startDate, endDate, period, timezone = 'UTC', groupBy = 'day' } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const revenueData = await ReportService.getRevenueAnalytics(dateRange, timezone, groupBy);
      
      res.json(formatResponse(true, revenueData, 'Revenue reports retrieved successfully'));
    } catch (error) {
      console.error('Revenue Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate revenue reports', error.message));
    };
  };

  /**
   * Get assistant and system performance metrics
   * @route GET /api/reports/performance
   */
    const getPerformanceReports = async (req, res) => {
    try {
      const { startDate, endDate, period, timezone = 'UTC', assistantId } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const performanceData = await ReportService.getPerformanceMetrics(dateRange, timezone, assistantId);
      
      res.json(formatResponse(true, performanceData, 'Performance reports retrieved successfully'));
    } catch (error) {
      console.error('Performance Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate performance reports', error.message));
    };
  };

  /**
   * Get recent activity and operational data
   * @route GET /api/reports/activity
   */
    const getActivityReports = async (req, res) => {
    try {
      const { startDate, endDate, limit = 50, offset = 0 } = req.query;
      const dateRange = validateDateRange(startDate, endDate);
      
      const activityData = await ReportService.getRecentActivity(dateRange);
      
      res.json(formatResponse(true, activityData, 'Activity reports retrieved successfully'));
    } catch (error) {
      console.error('Activity Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve activity reports', error.message));
    };
  };

  /**
   * Get trend data for specific metrics
   * @route GET /api/reports/trends/:type
   */
    const getTrendData = async (req, res) => {
    try {
      const { type } = req.params;
      const { startDate, endDate, period, interval = 'day', timezone = 'UTC' } = req.query;
      
      if (!Object.values(REPORT_TYPES.TRENDS).includes(type)) {
        return res.status(400).json(formatResponse(false, null, 'Invalid trend type specified'));
      }
      
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const trendData = await ReportService.getTrendDataByType(type, dateRange, interval, timezone);
      
      res.json(formatResponse(true, trendData, `${type} trend data retrieved successfully`));
    } catch (error) {
      console.error('Trend Data Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve trend data', error.message));
    };
  };

  /**
   * Get calculated business metrics and ratios
   * @route GET /api/reports/metrics
   */
const getBusinessMetrics = async (req, res) => {
    try {
      const { startDate, endDate, period, timezone = 'UTC' } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const metricsData = await ReportService.calculateBusinessMetrics(dateRange, timezone);
      
      res.json(formatResponse(true, metricsData, 'Business metrics retrieved successfully'));
    } catch (error) {
      console.error('Business Metrics Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to calculate business metrics', error.message));
    };
  };

  /**
   * Export report data in various formats
   * @route POST /api/reports/export
   */
 const exportReport = async (req, res) => {
    try {
      const { reportType, format, startDate, endDate, filters = {} } = req.body;
      
      if (!Object.values(REPORT_TYPES.EXPORT).includes(reportType)) {
        return res.status(400).json(formatResponse(false, null, 'Invalid report type for export'));
      }
      
      if (!Object.values(EXPORT_FORMATS).includes(format)) {
        return res.status(400).json(formatResponse(false, null, 'Invalid export format specified'));
      }
      
      const dateRange = validateDateRange(startDate, endDate);
      
      // Simplified export without queue system
      let reportData;
      switch (reportType) {
        case 'dashboard':
          reportData = await ReportService.getSummaryStats(dateRange);
          break;
        case 'revenue':
          reportData = await ReportService.getRevenueAnalytics(dateRange);
          break;
        default:
          reportData = { message: 'Export functionality not fully implemented' };
      }
      
      res.json(formatResponse(true, { 
        reportData,
        format,
        exportedAt: new Date().toISOString()
      }, 'Export completed successfully (simplified version)'));
    } catch (error) {
      console.error('Export Report Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to export report', error.message));
    };
  };

  /**
   * Generate custom reports with advanced filtering
   * @route POST /api/reports/custom
   */
 const generateCustomReport = async (req, res) => {
    try {
      const { reportConfig, filters, groupBy, metrics } = req.body;
      const { startDate, endDate, timezone = 'UTC' } = req.query;
      
      const dateRange = validateDateRange(startDate, endDate);
      
      const customReportData = await ReportService.generateCustomReport({
        config: reportConfig,
        dateRange,
        filters,
        groupBy,
        metrics,
        timezone
      });
      
      res.json(formatResponse(true, customReportData, 'Custom report generated successfully'));
    } catch (error) {
      console.error('Custom Report Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate custom report', error.message));
    };
  };

  /**
   * Get available filter options and configurations
   * @route GET /api/reports/filters
   */
  const getFilterOptions = async (req, res) => {
    try {
      const filterOptions = await ReportService.getAvailableFilters();
      
      res.json(formatResponse(true, filterOptions, 'Filter options retrieved successfully'));
    } catch (error) {
      console.error('Filter Options Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve filter options', error.message));
    };
  };

  /**
   * Health check for report system
   * @route GET /api/reports/health
   */
const getReportSystemHealth = async (req, res) => {
    try {
      const healthStatus = await ReportService.getSystemHealth();
      
      const statusCode = healthStatus.overall === 'healthy' ? 200 : 503;
      
      res.status(statusCode).json(formatResponse(
        healthStatus.overall === 'healthy', 
        healthStatus, 
        `Report system is ${healthStatus.overall}`
      ));
    } catch (error) {
      console.error('Health Check Error:', error);
      res.status(500).json(formatResponse(false, null, 'Health check failed', error.message));
    };
  };

module.exports = {
  getDashboardReports,
  getRevenueReports,
  getPerformanceReports,
  getActivityReports,
  getTrendData,
  getBusinessMetrics,
  exportReport,
  generateCustomReport,
  getFilterOptions,
  getReportSystemHealth
};