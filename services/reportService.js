const mongoose = require('mongoose');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const Assistant = require('../models/User');
const { aggregateByPeriod, calculateGrowthRate, formatCurrency } = require('../utils/reportHelpers');

// Define constants locally
const ORDER_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

const ASSISTANT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

const REPORT_TYPES = {
  TRENDS: {
    REVENUE: 'revenue',
    CUSTOMERS: 'customers',
    ORDERS: 'orders',
    ASSISTANTS: 'assistants'
  }
};

class ReportService {
  /**
   * Get comprehensive summary statistics
   */
  static async getSummaryStats(dateRange, timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      // Parallel execution for better performance
      const [
        orderStats,
        customerStats,
        assistantStats,
        revenueStats,
        previousPeriodStats
      ] = await Promise.all([
        this.getOrderStatistics(start, end),
        this.getCustomerStatistics(start, end),
        this.getAssistantStatistics(start, end),
        this.getRevenueStatistics(start, end),
        this.getPreviousPeriodStats(start, end)
      ]);

      // Calculate growth rates
      const totalRevenue = revenueStats.totalRevenue || 0;
      const totalOrders = orderStats.totalOrders || 0;
      const totalCustomers = customerStats.totalCustomers || 0;
      const activeAssistants = assistantStats.activeAssistants || 0;
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      const completionRate = orderStats.totalOrders > 0 ? 
        (orderStats.completedOrders / orderStats.totalOrders) * 100 : 0;

      return {
        totalRevenue,
        totalOrders,
        totalCustomers,
        activeAssistants,
        averageOrderValue,
        completionRate,
        growth: {
          revenue: calculateGrowthRate(totalRevenue, previousPeriodStats.totalRevenue),
          orders: calculateGrowthRate(totalOrders, previousPeriodStats.totalOrders),
          customers: calculateGrowthRate(totalCustomers, previousPeriodStats.totalCustomers),
          averageOrderValue: calculateGrowthRate(averageOrderValue, previousPeriodStats.averageOrderValue)
        },
        breakdown: {
          ordersByStatus: orderStats.ordersByStatus,
          customersBySource: customerStats.customersBySource,
          revenueByService: revenueStats.revenueByService
        }
      };
    } catch (error) {
      console.error('Error in getSummaryStats:', error);
      throw new Error('Failed to generate summary statistics');
    }
  }

  /**
   * Get trend data for charts
   */
  static async getTrendData(dateRange, timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      const [revenueTrend, ordersTrend, customersTrend] = await Promise.all([
        this.getRevenueTrendData(start, end, timezone),
        this.getOrdersTrendData(start, end, timezone),
        this.getCustomersTrendData(start, end, timezone)
      ]);

      return {
        revenueTrend,
        ordersTrend,
        customersTrend
      };
    } catch (error) {
      console.error('Error in getTrendData:', error);
      throw new Error('Failed to generate trend data');
    }
  }

  /**
   * Get detailed order metrics
   */
  static async getOrderMetrics(dateRange, timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      const orderAggregation = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(start), $lte: new Date(end) }
          }
        },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$orderTotal' },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, 1, 0] }
            },
            pendingOrders: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.PENDING] }, 1, 0] }
            },
            cancelledOrders: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.CANCELLED] }, 1, 0] }
            },
            averageOrderValue: { $avg: '$orderTotal' },
            maxOrderValue: { $max: '$orderTotal' },
            minOrderValue: { $min: '$orderTotal' }
          }
        }
      ]);

      const orderData = orderAggregation[0] || {};
      
      // Get revenue by period (daily breakdown)
      const revenueByPeriod = await this.getRevenueByPeriod(start, end, 'day', timezone);
      
      // Get orders by status
      const ordersByStatus = {
        completed: orderData.completedOrders || 0,
        pending: orderData.pendingOrders || 0,
        cancelled: orderData.cancelledOrders || 0,
        processing: orderData.totalOrders - orderData.completedOrders - orderData.pendingOrders - orderData.cancelledOrders || 0
      };

      return {
        totalOrders: orderData.totalOrders || 0,
        totalRevenue: orderData.totalRevenue || 0,
        completedOrders: orderData.completedOrders || 0,
        averageOrderValue: orderData.averageOrderValue || 0,
        maxOrderValue: orderData.maxOrderValue || 0,
        minOrderValue: orderData.minOrderValue || 0,
        ordersByStatus,
        revenueByPeriod
      };
    } catch (error) {
      console.error('Error in getOrderMetrics:', error);
      throw new Error('Failed to generate order metrics');
    }
  }

  /**
   * Get assistant performance metrics
   */
  static async getAssistantMetrics(dateRange, timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      const assistantPerformance = await Order.aggregate([
        {
          $match: {
            createdAt: { $gte: new Date(start), $lte: new Date(end) },
            assignedAssistant: { $exists: true, $ne: null }
          }
        },
        {
          $lookup: {
            from: 'assistants',
            localField: 'assignedAssistant',
            foreignField: '_id',
            as: 'assistant'
          }
        },
        {
          $unwind: '$assistant'
        },
        {
          $group: {
            _id: '$assignedAssistant',
            name: { $first: '$assistant.fullName' },
            email: { $first: '$assistant.email' },
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, 1, 0] }
            },
            totalRevenue: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, '$orderTotal', 0] }
            },
            averageOrderValue: {
              $avg: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, '$orderTotal', null] }
            }
          }
        },
        {
          $addFields: {
            completionRate: {
              $multiply: [
                { $divide: ['$completedOrders', '$totalOrders'] },
                100
              ]
            }
          }
        },
        {
          $sort: { totalRevenue: -1 }
        }
      ]);

      // Get active assistants count
      const activeAssistants = await Assistant.countDocuments({
        status: ASSISTANT_STATUS.ACTIVE,
        lastActive: { $gte: new Date(start) }
      });

      // Get assistant activity trends
      const assistantActivity = await this.getAssistantActivityTrend(start, end, timezone);

      return {
        activeAssistants,
        assistantPerformance,
        assistantActivity,
        topPerformers: assistantPerformance.slice(0, 5),
        performanceMetrics: {
          averageCompletionRate: assistantPerformance.length > 0 ? 
            assistantPerformance.reduce((sum, assistant) => sum + assistant.completionRate, 0) / assistantPerformance.length : 0,
          totalAssignedOrders: assistantPerformance.reduce((sum, assistant) => sum + assistant.totalOrders, 0),
          totalCompletedOrders: assistantPerformance.reduce((sum, assistant) => sum + assistant.completedOrders, 0)
        }
      };
    } catch (error) {
      console.error('Error in getAssistantMetrics:', error);
      throw new Error('Failed to generate assistant metrics');
    }
  }

  /**
   * Get recent activity data
   */
  static async getRecentActivity(dateRange, timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      const [recentOrders, recentCustomers, recentAssignments] = await Promise.all([
        Order.find({
          createdAt: { $gte: new Date(start), $lte: new Date(end) }
        })
        .populate('customerId', 'fullName email')
        .populate('assignedAssistant', 'fullName')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),

        Customer.find({
          createdAt: { $gte: new Date(start), $lte: new Date(end) }
        })
        .populate('assignedAssistant', 'fullName')
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),

        this.getRecentAssignments(start, end, 10)
      ]);

      return {
        recentOrders,
        recentCustomers,
        recentAssignments,
        activitySummary: {
          totalOrdersToday: await this.getTodayOrdersCount(),
          totalCustomersToday: await this.getTodayCustomersCount(),
          activeAssistantsToday: await this.getTodayActiveAssistantsCount()
        }
      };
    } catch (error) {
      console.error('Error in getRecentActivity:', error);
      throw new Error('Failed to generate recent activity data');
    }
  }

  /**
   * Get revenue analytics with flexible grouping
   */
  static async getRevenueAnalytics(dateRange, timezone = 'UTC', groupBy = 'day') {
    try {
      const { start, end } = dateRange;
      
      const revenueData = await this.getRevenueByPeriod(start, end, groupBy, timezone);
      const revenueBreakdown = await this.getRevenueBreakdown(start, end);
      
      // Calculate revenue metrics
      const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
      const averageDailyRevenue = revenueData.length > 0 ? totalRevenue / revenueData.length : 0;
      const highestRevenue = Math.max(...revenueData.map(item => item.revenue));
      const lowestRevenue = Math.min(...revenueData.map(item => item.revenue));

      return {
        totalRevenue,
        averageDailyRevenue,
        highestRevenue,
        lowestRevenue,
        revenueData,
        revenueBreakdown,
        projections: await this.calculateRevenueProjections(revenueData)
      };
    } catch (error) {
      console.error('Error in getRevenueAnalytics:', error);
      throw new Error('Failed to generate revenue analytics');
    }
  }

  /**
   * Get performance metrics for assistants and system
   */
  static async getPerformanceMetrics(dateRange, timezone = 'UTC', assistantId = null) {
    try {
      const { start, end } = dateRange;
      
      const matchStage = {
        createdAt: { $gte: new Date(start), $lte: new Date(end) }
      };
      
      if (assistantId) {
        matchStage.assignedAssistant = new mongoose.Types.ObjectId(assistantId);
      }

      const performanceData = await Order.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: assistantId ? '$assignedAssistant' : null,
            totalOrders: { $sum: 1 },
            completedOrders: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, 1, 0] }
            },
            averageProcessingTime: { $avg: '$processingTime' },
            totalRevenue: {
              $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, '$orderTotal', 0] }
            }
          }
        }
      ]);

      const responseTimeMetrics = await this.getResponseTimeMetrics(start, end, assistantId);
      const satisfactionMetrics = await this.getSatisfactionMetrics(start, end, assistantId);

      return {
        performanceData: performanceData[0] || {},
        responseTimeMetrics,
        satisfactionMetrics,
        systemMetrics: await this.getSystemPerformanceMetrics(start, end)
      };
    } catch (error) {
      console.error('Error in getPerformanceMetrics:', error);
      throw new Error('Failed to generate performance metrics');
    }
  }

  /**
   * Get trend data by specific type
   */
  static async getTrendDataByType(type, dateRange, interval = 'day', timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      switch (type) {
        case REPORT_TYPES.TRENDS.REVENUE:
          return await this.getRevenueTrendData(start, end, timezone, interval);
        
        case REPORT_TYPES.TRENDS.CUSTOMERS:
          return await this.getCustomersTrendData(start, end, timezone, interval);
        
        case REPORT_TYPES.TRENDS.ORDERS:
          return await this.getOrdersTrendData(start, end, timezone, interval);
        
        case REPORT_TYPES.TRENDS.ASSISTANTS:
          return await this.getAssistantActivityTrend(start, end, timezone, interval);
        
        default:
          throw new Error(`Unsupported trend type: ${type}`);
      }
    } catch (error) {
      console.error('Error in getTrendDataByType:', error);
      throw new Error(`Failed to generate ${type} trend data`);
    }
  }

  /**
   * Calculate business metrics and ratios
   */
  static async calculateBusinessMetrics(dateRange, timezone = 'UTC') {
    try {
      const { start, end } = dateRange;
      
      const [orderMetrics, customerMetrics, assistantMetrics] = await Promise.all([
        this.getOrderMetrics(dateRange, timezone),
        this.getCustomerMetrics(dateRange, timezone),
        this.getAssistantMetrics(dateRange, timezone)
      ]);

      // Calculate key business ratios
      const customerAcquisitionCost = customerMetrics.marketingSpend / customerMetrics.newCustomers || 0;
      const customerLifetimeValue = orderMetrics.averageOrderValue * customerMetrics.averageOrdersPerCustomer || 0;
      const conversionRate = (orderMetrics.totalOrders / customerMetrics.totalCustomers) * 100 || 0;
      const churnRate = customerMetrics.churnedCustomers / customerMetrics.totalCustomers * 100 || 0;

      return {
        financialMetrics: {
          totalRevenue: orderMetrics.totalRevenue,
          averageOrderValue: orderMetrics.averageOrderValue,
          revenueGrowthRate: orderMetrics.revenueGrowthRate || 0
        },
        customerMetrics: {
          customerAcquisitionCost,
          customerLifetimeValue,
          conversionRate,
          churnRate,
          customerSatisfactionScore: customerMetrics.satisfactionScore || 0
        },
        operationalMetrics: {
          orderFulfillmentRate: orderMetrics.completedOrders / orderMetrics.totalOrders * 100 || 0,
          averageProcessingTime: assistantMetrics.averageProcessingTime || 0,
          assistantUtilizationRate: assistantMetrics.utilizationRate || 0
        }
      };
    } catch (error) {
      console.error('Error in calculateBusinessMetrics:', error);
      throw new Error('Failed to calculate business metrics');
    }
  }

  /**
   * Generate custom reports
   */
  static async generateCustomReport(options) {
    try {
      const { config, dateRange, filters, groupBy, metrics, timezone } = options;
      const { start, end } = dateRange;
      
      // Build dynamic aggregation pipeline
      const pipeline = [];
      
      // Match stage with date range and filters
      const matchStage = {
        createdAt: { $gte: new Date(start), $lte: new Date(end) }
      };
      
      // Apply additional filters
      if (filters.status) matchStage.status = filters.status;
      if (filters.assistantId) matchStage.assignedAssistant = new mongoose.Types.ObjectId(filters.assistantId);
      if (filters.customerId) matchStage.customerId = new mongoose.Types.ObjectId(filters.customerId);
      if (filters.minValue) matchStage.orderTotal = { $gte: filters.minValue };
      if (filters.maxValue) matchStage.orderTotal = { ...matchStage.orderTotal, $lte: filters.maxValue };
      
      pipeline.push({ $match: matchStage });
      
      // Add lookup stages if needed
      if (config.includeCustomerData) {
        pipeline.push({
          $lookup: {
            from: 'customers',
            localField: 'customerId',
            foreignField: '_id',
            as: 'customer'
          }
        });
      }
      
      if (config.includeAssistantData) {
        pipeline.push({
          $lookup: {
            from: 'assistants',
            localField: 'assignedAssistant',
            foreignField: '_id',
            as: 'assistant'
          }
        });
      }
      
      // Group stage based on groupBy parameter
      const groupStage = this.buildGroupStage(groupBy, metrics);
      pipeline.push({ $group: groupStage });
      
      // Sort stage
      pipeline.push({ $sort: { _id: 1 } });
      
      const customData = await Order.aggregate(pipeline);
      
      return {
        data: customData,
        metadata: {
          totalRecords: customData.length,
          dateRange,
          filters,
          groupBy,
          metrics,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error in generateCustomReport:', error);
      throw new Error('Failed to generate custom report');
    }
  }

  /**
   * Get available filter options
   */
  static async getAvailableFilters() {
    try {
      const [assistants, statuses, serviceTypes] = await Promise.all([
        Assistant.find({ status: ASSISTANT_STATUS.ACTIVE })
          .select('_id fullName email')
          .lean(),
        
        Order.distinct('status'),
        Order.distinct('serviceType')
      ]);

      return {
        assistants: assistants.map(assistant => ({
          id: assistant._id,
          name: assistant.fullName,
          email: assistant.email
        })),
        statuses,
        serviceTypes,
        dateRangePresets: [
          { label: 'Last 7 days', value: '7d' },
          { label: 'Last 30 days', value: '30d' },
          { label: 'Last 3 months', value: '3m' },
          { label: 'Last 6 months', value: '6m' },
          { label: 'Last year', value: '1y' }
        ]
      };
    } catch (error) {
      console.error('Error in getAvailableFilters:', error);
      throw new Error('Failed to get available filters');
    }
  }

  /**
   * Estimate export size
   */
  static async estimateExportSize(reportType, dateRange, filters = {}) {
    try {
      const { start, end } = dateRange;
      
      const matchStage = {
        createdAt: { $gte: new Date(start), $lte: new Date(end) }
      };
      
      // Apply filters
      Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined) {
          matchStage[key] = filters[key];
        }
      });
      
      const estimatedCount = await Order.countDocuments(matchStage);
      
      return estimatedCount;
    } catch (error) {
      console.error('Error in estimateExportSize:', error);
      throw new Error('Failed to estimate export size');
    }
  }

  /**
   * Get system health status
   */
  static async getSystemHealth() {
    try {
      const healthChecks = await Promise.all([
        this.checkDatabaseHealth(),
        this.checkCacheHealth(),
        this.checkExportSystemHealth()
      ]);
      
      const overallHealth = healthChecks.every(check => check.status === 'healthy') ? 'healthy' : 'degraded';
      
      return {
        overall: overallHealth,
        timestamp: new Date().toISOString(),
        checks: {
          database: healthChecks[0],
          cache: healthChecks[1],
          exportSystem: healthChecks[2]
        }
      };
    } catch (error) {
      console.error('Error in getSystemHealth:', error);
      return {
        overall: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      };
    }
  }

  // Helper methods
  static async getOrderStatistics(start, end) {
    const stats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(start), $lte: new Date(end) }
        }
      },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', ORDER_STATUS.COMPLETED] }, 1, 0] }
          },
          ordersByStatus: {
            $push: {
              status: '$status',
              count: 1
            }
          }
        }
      }
    ]);

    const result = stats[0] || { totalOrders: 0, completedOrders: 0, ordersByStatus: [] };
    
    // Process ordersByStatus
    const statusCounts = {};
    result.ordersByStatus.forEach(item => {
      statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
    });
    result.ordersByStatus = statusCounts;

    return result;
  }

  static async getCustomerStatistics(start, end) {
    const totalCustomers = await Customer.countDocuments({
      createdAt: { $gte: new Date(start), $lte: new Date(end) }
    });

    const customersBySource = await Customer.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(start), $lte: new Date(end) }
        }
      },
      {
        $group: {
          _id: '$source',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      totalCustomers,
      customersBySource: customersBySource.reduce((acc, item) => {
        acc[item._id || 'unknown'] = item.count;
        return acc;
      }, {})
    };
  }

  static async getAssistantStatistics(start, end) {
    const activeAssistants = await Assistant.countDocuments({
      status: ASSISTANT_STATUS.ACTIVE,
      lastActive: { $gte: new Date(start) }
    });

    return { activeAssistants };
  }

  static async getRevenueStatistics(start, end) {
    const revenueStats = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: new Date(start), $lte: new Date(end) },
          status: ORDER_STATUS.COMPLETED
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$orderTotal' },
          revenueByService: {
            $push: {
              service: '$serviceType',
              revenue: '$orderTotal'
            }
          }
        }
      }
    ]);

    const result = revenueStats[0] || { totalRevenue: 0, revenueByService: [] };
    
    // Process revenueByService
    const serviceCounts = {};
    result.revenueByService.forEach(item => {
      const service = item.service || 'unknown';
      serviceCounts[service] = (serviceCounts[service] || 0) + item.revenue;
    });
    result.revenueByService = serviceCounts;

    return result;
  }

  static async getPreviousPeriodStats(start, end) {
    const periodDuration = new Date(end) - new Date(start);
    const previousStart = new Date(new Date(start) - periodDuration);
    const previousEnd = new Date(start);

    const [orderStats, revenueStats] = await Promise.all([
      this.getOrderStatistics(previousStart, previousEnd),
      this.getRevenueStatistics(previousStart, previousEnd)
    ]);

    return {
      totalOrders: orderStats.totalOrders,
      totalRevenue: revenueStats.totalRevenue,
      averageOrderValue: orderStats.totalOrders > 0 ? revenueStats.totalRevenue / orderStats.totalOrders : 0
    };
  }

  static buildGroupStage(groupBy, metrics) {
    const groupStage = { _id: null };
    
    // Add metrics to group stage
    metrics.forEach(metric => {
      switch (metric) {
        case 'sum':
          groupStage.total = { $sum: '$orderTotal' };
          break;
        case 'avg':
          groupStage.average = { $avg: '$orderTotal' };
          break;
        case 'count':
          groupStage.count = { $sum: 1 };
          break;
        case 'max':
          groupStage.maximum = { $max: '$orderTotal' };
          break;
        case 'min':
          groupStage.minimum = { $min: '$orderTotal' };
          break;
      }
    });
    
    return groupStage;
  }

  static async checkDatabaseHealth() {
    try {
      await Order.findOne().limit(1);
      return { status: 'healthy', responseTime: Date.now() };
    } catch (error) {
      return { status: 'unhealthy', error: error.message };
    }
  }

  static async checkCacheHealth() {
    // This would check Redis/cache health
    return { status: 'healthy' };
  }

  static async checkExportSystemHealth() {
    // This would check export system health
    return { status: 'healthy' };
  }
}

module.exports = ReportService;