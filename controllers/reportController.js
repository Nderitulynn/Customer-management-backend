const ReportService = require('../services/reportService');
const ExportService = require('../services/exportService');
const CacheService = require('../services/cacheService');
const { validateDateRange, formatResponse } = require('../utils/reportHelpers');
const { REPORT_TYPES, EXPORT_FORMATS, CACHE_KEYS } = require('../constants/reportTypes');

class ReportController {
  /**
   * Get comprehensive dashboard report data
   * @route GET /api/reports/dashboard
   */
  static async getDashboardReports(req, res) {
    try {
      const { startDate, endDate, period, timezone = 'UTC' } = req.query;
      
      // Validate and parse date range
      const dateRange = validateDateRange(startDate, endDate, period);
      
      // Check cache first
      const cacheKey = `${CACHE_KEYS.DASHBOARD}:${dateRange.start}:${dateRange.end}`;
      let reportData = await CacheService.get(cacheKey);
      
      if (!reportData) {
        // Generate fresh report data
        const [summary, trends, orderMetrics, assistantMetrics, recentActivity] = await Promise.all([
          ReportService.getSummaryStats(dateRange, timezone),
          ReportService.getTrendData(dateRange, timezone),
          ReportService.getOrderMetrics(dateRange, timezone),
          ReportService.getAssistantMetrics(dateRange, timezone),
          ReportService.getRecentActivity(dateRange, timezone)
        ]);
        
        reportData = {
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
        
        // Cache for 5 minutes
        await CacheService.set(cacheKey, reportData, 300);
      }
      
      res.json(formatResponse(true, reportData, 'Dashboard reports retrieved successfully'));
    } catch (error) {
      console.error('Dashboard Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate dashboard reports', error.message));
    }
  }

  /**
   * Get summary statistics and KPIs
   * @route GET /api/reports/summary
   */
  static async getSummaryStats(req, res) {
    try {
      const { startDate, endDate, period, timezone = 'UTC' } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const cacheKey = `${CACHE_KEYS.SUMMARY}:${dateRange.start}:${dateRange.end}`;
      let summaryData = await CacheService.get(cacheKey);
      
      if (!summaryData) {
        summaryData = await ReportService.getSummaryStats(dateRange, timezone);
        await CacheService.set(cacheKey, summaryData, 180); // 3 minutes cache
      }
      
      res.json(formatResponse(true, summaryData, 'Summary statistics retrieved successfully'));
    } catch (error) {
      console.error('Summary Stats Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve summary statistics', error.message));
    }
  }

  /**
   * Get detailed revenue analytics
   * @route GET /api/reports/revenue
   */
  static async getRevenueReports(req, res) {
    try {
      const { startDate, endDate, period, timezone = 'UTC', groupBy = 'day' } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const cacheKey = `${CACHE_KEYS.REVENUE}:${dateRange.start}:${dateRange.end}:${groupBy}`;
      let revenueData = await CacheService.get(cacheKey);
      
      if (!revenueData) {
        revenueData = await ReportService.getRevenueAnalytics(dateRange, timezone, groupBy);
        await CacheService.set(cacheKey, revenueData, 300);
      }
      
      res.json(formatResponse(true, revenueData, 'Revenue reports retrieved successfully'));
    } catch (error) {
      console.error('Revenue Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate revenue reports', error.message));
    }
  }

  /**
   * Get assistant and system performance metrics
   * @route GET /api/reports/performance
   */
  static async getPerformanceReports(req, res) {
    try {
      const { startDate, endDate, period, timezone = 'UTC', assistantId } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const cacheKey = `${CACHE_KEYS.PERFORMANCE}:${dateRange.start}:${dateRange.end}:${assistantId || 'all'}`;
      let performanceData = await CacheService.get(cacheKey);
      
      if (!performanceData) {
        performanceData = await ReportService.getPerformanceMetrics(dateRange, timezone, assistantId);
        await CacheService.set(cacheKey, performanceData, 240);
      }
      
      res.json(formatResponse(true, performanceData, 'Performance reports retrieved successfully'));
    } catch (error) {
      console.error('Performance Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to generate performance reports', error.message));
    }
  }

  /**
   * Get recent activity and operational data
   * @route GET /api/reports/activity
   */
  static async getActivityReports(req, res) {
    try {
      const { startDate, endDate, limit = 50, offset = 0 } = req.query;
      const dateRange = validateDateRange(startDate, endDate);
      
      const activityData = await ReportService.getActivityData(dateRange, parseInt(limit), parseInt(offset));
      
      res.json(formatResponse(true, activityData, 'Activity reports retrieved successfully'));
    } catch (error) {
      console.error('Activity Reports Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve activity reports', error.message));
    }
  }

  /**
   * Get trend data for specific metrics
   * @route GET /api/reports/trends/:type
   */
  static async getTrendData(req, res) {
    try {
      const { type } = req.params;
      const { startDate, endDate, period, interval = 'day', timezone = 'UTC' } = req.query;
      
      if (!Object.values(REPORT_TYPES.TRENDS).includes(type)) {
        return res.status(400).json(formatResponse(false, null, 'Invalid trend type specified'));
      }
      
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const cacheKey = `${CACHE_KEYS.TRENDS}:${type}:${dateRange.start}:${dateRange.end}:${interval}`;
      let trendData = await CacheService.get(cacheKey);
      
      if (!trendData) {
        trendData = await ReportService.getTrendDataByType(type, dateRange, interval, timezone);
        await CacheService.set(cacheKey, trendData, 360);
      }
      
      res.json(formatResponse(true, trendData, `${type} trend data retrieved successfully`));
    } catch (error) {
      console.error('Trend Data Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve trend data', error.message));
    }
  }

  /**
   * Get calculated business metrics and ratios
   * @route GET /api/reports/metrics
   */
  static async getBusinessMetrics(req, res) {
    try {
      const { startDate, endDate, period, timezone = 'UTC' } = req.query;
      const dateRange = validateDateRange(startDate, endDate, period);
      
      const cacheKey = `${CACHE_KEYS.METRICS}:${dateRange.start}:${dateRange.end}`;
      let metricsData = await CacheService.get(cacheKey);
      
      if (!metricsData) {
        metricsData = await ReportService.calculateBusinessMetrics(dateRange, timezone);
        await CacheService.set(cacheKey, metricsData, 420);
      }
      
      res.json(formatResponse(true, metricsData, 'Business metrics retrieved successfully'));
    } catch (error) {
      console.error('Business Metrics Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to calculate business metrics', error.message));
    }
  }

  /**
   * Export report data in various formats
   * @route POST /api/reports/export
   */
  static async exportReport(req, res) {
    try {
      const { reportType, format, startDate, endDate, filters = {} } = req.body;
      const userId = req.user.id;
      
      if (!Object.values(REPORT_TYPES.EXPORT).includes(reportType)) {
        return res.status(400).json(formatResponse(false, null, 'Invalid report type for export'));
      }
      
      if (!Object.values(EXPORT_FORMATS).includes(format)) {
        return res.status(400).json(formatResponse(false, null, 'Invalid export format specified'));
      }
      
      const dateRange = validateDateRange(startDate, endDate);
      
      // Check export size limits
      const estimatedSize = await ReportService.estimateExportSize(reportType, dateRange, filters);
      if (estimatedSize > process.env.MAX_EXPORT_SIZE || 50000) { // Default 50k records
        return res.status(400).json(formatResponse(false, null, 'Export too large. Please reduce date range or add filters', 'EXPORT_TOO_LARGE'));
      }
      
      // Queue export job
      const exportJob = await ExportService.queueExport({
        userId,
        reportType,
        format,
        dateRange,
        filters,
        requestedAt: new Date()
      });
      
      res.json(formatResponse(true, { 
        exportId: exportJob.id, 
        status: 'queued',
        estimatedCompletionTime: exportJob.estimatedCompletionTime
      }, 'Export request queued successfully'));
    } catch (error) {
      console.error('Export Report Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to queue export request', error.message));
    }
  }

  /**
   * Generate custom reports with advanced filtering
   * @route POST /api/reports/custom
   */
  static async generateCustomReport(req, res) {
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
    }
  }

  /**
   * Get available filter options and configurations
   * @route GET /api/reports/filters
   */
  static async getFilterOptions(req, res) {
    try {
      const filterOptions = await ReportService.getAvailableFilters();
      
      res.json(formatResponse(true, filterOptions, 'Filter options retrieved successfully'));
    } catch (error) {
      console.error('Filter Options Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to retrieve filter options', error.message));
    }
  }

  /**
   * Check status of long-running export operations
   * @route GET /api/reports/status/:exportId
   */
  static async getExportStatus(req, res) {
    try {
      const { exportId } = req.params;
      const userId = req.user.id;
      
      const exportStatus = await ExportService.getExportStatus(exportId, userId);
      
      if (!exportStatus) {
        return res.status(404).json(formatResponse(false, null, 'Export not found'));
      }
      
      res.json(formatResponse(true, exportStatus, 'Export status retrieved successfully'));
    } catch (error) {
      console.error('Export Status Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to get export status', error.message));
    }
  }

  /**
   * Download completed export file
   * @route GET /api/reports/download/:exportId
   */
  static async downloadExport(req, res) {
    try {
      const { exportId } = req.params;
      const userId = req.user.id;
      
      const exportFile = await ExportService.getExportFile(exportId, userId);
      
      if (!exportFile) {
        return res.status(404).json(formatResponse(false, null, 'Export file not found or not ready'));
      }
      
      res.setHeader('Content-Type', exportFile.contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${exportFile.filename}"`);
      res.setHeader('Content-Length', exportFile.size);
      
      exportFile.stream.pipe(res);
    } catch (error) {
      console.error('Download Export Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to download export file', error.message));
    }
  }

  /**
   * Delete export file and cleanup
   * @route DELETE /api/reports/export/:exportId
   */
  static async deleteExport(req, res) {
    try {
      const { exportId } = req.params;
      const userId = req.user.id;
      
      const deleted = await ExportService.deleteExport(exportId, userId);
      
      if (!deleted) {
        return res.status(404).json(formatResponse(false, null, 'Export not found'));
      }
      
      res.json(formatResponse(true, null, 'Export deleted successfully'));
    } catch (error) {
      console.error('Delete Export Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to delete export', error.message));
    }
  }

  /**
   * Clear report cache (for debugging/maintenance)
   * @route GET /api/reports/cache/clear
   */
  static async clearReportCache(req, res) {
    try {
      const { pattern } = req.query;
      
      const clearedKeys = await CacheService.clearPattern(pattern || 'reports:*');
      
      res.json(formatResponse(true, { clearedKeys }, 'Report cache cleared successfully'));
    } catch (error) {
      console.error('Clear Cache Error:', error);
      res.status(500).json(formatResponse(false, null, 'Failed to clear report cache', error.message));
    }
  }

  /**
   * Health check for report system
   * @route GET /api/reports/health
   */
  static async getReportSystemHealth(req, res) {
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
    }
  }
}

module.exports = ReportController;