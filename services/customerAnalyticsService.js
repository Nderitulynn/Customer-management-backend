const Customer = require('../models/Customer');
const { roleBasedFilter } = require('../utils/roleBasedFilter');
const { 
  // utility functions as needed
} = require('../utils/aggregationHelpers');



/**
 * Get regular customers (repeat customers)
 * @param {string} userRole - Role of the requesting user
 * @returns {Array} Regular customers list
 */
const getRegularCustomers = async (userRole) => {
  try {
    const baseQuery = roleBasedFilter(userRole, 'customer');
    
    const pipeline = [
      { $match: baseQuery },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          lastOrderDate: { $max: '$orders.createdAt' }
        }
      },
      {
        $match: {
          orderCount: { $gt: 1 } // More than 1 order makes them regular
        }
      },
      {
        $sort: { orderCount: -1 }
      }
    ];

    const regularCustomers = await Customer.aggregate(pipeline);

    return {
      count: regularCustomers.length,
      customers: regularCustomers.map(customer => ({
        id: customer._id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        orderCount: customer.orderCount,
        lastOrderDate: customer.lastOrderDate,
        joinDate: customer.createdAt,
        status: customer.status
      })),
      lastUpdated: new Date()
    };
  } catch (error) {
    throw new Error(`Failed to fetch regular customers: ${error.message}`);
  }
};

/**
 * Get customer type breakdown (new vs regular)
 * @param {string} userRole - Role of the requesting user
 * @returns {Object} Customer type distribution
 */
const getCustomerTypeBreakdown = async (userRole) => {
  try {
    const baseQuery = roleBasedFilter(userRole, 'customer');
    
    const pipeline = [
      { $match: baseQuery },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          orderCount: { $size: '$orders' },
          customerType: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 1] },
              'regular',
              'new'
            ]
          }
        }
      },
      {
        $group: {
          _id: '$customerType',
          count: { $sum: 1 },
          customers: { $push: '$$ROOT' }
        }
      }
    ];

    const breakdown = await Customer.aggregate(pipeline);
    
    const result = {
      new: 0,
      regular: 0,
      total: 0
    };

    breakdown.forEach(group => {
      result[group._id] = group.count;
      result.total += group.count;
    });

    // Calculate percentages
    const newPercentage = result.total > 0 ? (result.new / result.total * 100).toFixed(1) : 0;
    const regularPercentage = result.total > 0 ? (result.regular / result.total * 100).toFixed(1) : 0;

    return {
      breakdown: {
        newCustomers: {
          count: result.new,
          percentage: parseFloat(newPercentage)
        },
        regularCustomers: {
          count: result.regular,
          percentage: parseFloat(regularPercentage)
        }
      },
      totalCustomers: result.total,
      lastUpdated: new Date()
    };
  } catch (error) {
    throw new Error(`Failed to fetch customer type breakdown: ${error.message}`);
  }
};

/**
 * Get customer activity report with WhatsApp engagement metrics
 * @param {string} userRole - Role of the requesting user
 * @param {number} days - Number of days to look back (default: 30)
 * @returns {Object} Customer activity metrics
 */
const getCustomerActivityReport = async (userRole, days = 30) => {
  try {
    const baseQuery = roleBasedFilter(userRole, 'customer');
    const dateThreshold = new Date();
    dateThreshold.setDate(dateThreshold.getDate() - days);

    // Get basic activity metrics
    const activityPipeline = [
      { $match: baseQuery },
      {
        $lookup: {
          from: 'whatsappMessages',
          localField: '_id',
          foreignField: 'customerId',
          as: 'messages'
        }
      },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          recentMessages: {
            $filter: {
              input: '$messages',
              cond: { $gte: ['$$this.createdAt', dateThreshold] }
            }
          },
          recentOrders: {
            $filter: {
              input: '$orders',
              cond: { $gte: ['$$this.createdAt', dateThreshold] }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalCustomers: { $sum: 1 },
          whatsappActiveCustomers: {
            $sum: {
              $cond: [{ $gt: [{ $size: '$recentMessages' }, 0] }, 1, 0]
            }
          },
          orderActiveCustomers: {
            $sum: {
              $cond: [{ $gt: [{ $size: '$recentOrders' }, 0] }, 1, 0]
            }
          },
          totalWhatsappMessages: { $sum: { $size: '$recentMessages' } },
          totalOrders: { $sum: { $size: '$recentOrders' } },
          averageMessagesPerCustomer: { $avg: { $size: '$recentMessages' } }
        }
      }
    ];

    const [activityStats] = await Customer.aggregate(activityPipeline);

    // Get daily WhatsApp engagement
    const dailyEngagementPipeline = [
      { $match: baseQuery },
      {
        $lookup: {
          from: 'whatsappMessages',
          localField: '_id',
          foreignField: 'customerId',
          as: 'messages'
        }
      },
      { $unwind: '$messages' },
      {
        $match: {
          'messages.createdAt': { $gte: dateThreshold }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$messages.createdAt'
            }
          },
          uniqueCustomers: { $addToSet: '$_id' },
          totalMessages: { $sum: 1 }
        }
      },
      {
        $project: {
          date: '$_id',
          uniqueCustomers: { $size: '$uniqueCustomers' },
          totalMessages: 1
        }
      },
      { $sort: { date: 1 } }
    ];

    const dailyEngagement = await Customer.aggregate(dailyEngagementPipeline);

    const whatsappEngagementRate = activityStats && activityStats.totalCustomers > 0 
      ? (activityStats.whatsappActiveCustomers / activityStats.totalCustomers * 100).toFixed(1)
      : 0;

    const orderEngagementRate = activityStats && activityStats.totalCustomers > 0 
      ? (activityStats.orderActiveCustomers / activityStats.totalCustomers * 100).toFixed(1)
      : 0;

    return {
      period: `${days} days`,
      totalCustomers: activityStats?.totalCustomers || 0,
      whatsappMetrics: {
        activeCustomers: activityStats?.whatsappActiveCustomers || 0,
        engagementRate: parseFloat(whatsappEngagementRate),
        totalMessages: activityStats?.totalWhatsappMessages || 0,
        averageMessagesPerCustomer: Math.round((activityStats?.averageMessagesPerCustomer || 0) * 100) / 100
      },
      orderMetrics: {
        activeCustomers: activityStats?.orderActiveCustomers || 0,
        engagementRate: parseFloat(orderEngagementRate),
        totalOrders: activityStats?.totalOrders || 0
      },
      dailyWhatsappEngagement: dailyEngagement.map(day => ({
        date: day.date,
        uniqueCustomers: day.uniqueCustomers,
        totalMessages: day.totalMessages,
        averageMessagesPerCustomer: day.uniqueCustomers > 0
          ? Math.round((day.totalMessages / day.uniqueCustomers) * 100) / 100
          : 0
      })),
      lastUpdated: new Date()
    };
  } catch (error) {
    throw new Error(`Failed to fetch activity report: ${error.message}`);
  }
};

/**
 * Get basic revenue analytics (Admin only)
 * @param {string} userRole - Role of the requesting user
 * @param {string} period - Time period ('month', 'quarter', 'year')
 * @returns {Object} Basic revenue totals
 */
const getRevenueAnalytics = async (userRole, period = 'month') => {
  if (userRole !== 'admin') {
    throw new Error('Access denied: Revenue analytics require admin privileges');
  }

  try {
    const baseQuery = roleBasedFilter(userRole, 'customer');
    let dateRange;
    
    switch (period) {
      case 'quarter':
        dateRange = new Date();
        dateRange.setMonth(dateRange.getMonth() - 3);
        break;
      case 'year':
        dateRange = new Date();
        dateRange.setFullYear(dateRange.getFullYear() - 1);
        break;
      default: // month
        dateRange = new Date();
        dateRange.setMonth(dateRange.getMonth() - 1);
    }

    const revenuePipeline = [
      { $match: baseQuery },
      {
        $lookup: {
          from: 'orders',
          localField: '_id',
          foreignField: 'customerId',
          as: 'orders'
        }
      },
      {
        $addFields: {
          periodOrders: {
            $filter: {
              input: '$orders',
              cond: { $gte: ['$$this.createdAt', dateRange] }
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalSpent' },
          periodRevenue: { $sum: { $sum: '$periodOrders.totalAmount' } },
          totalCustomers: { $sum: 1 },
          payingCustomers: {
            $sum: {
              $cond: [{ $gt: ['$totalSpent', 0] }, 1, 0]
            }
          }
        }
      }
    ];

    const [revenueData] = await Customer.aggregate(revenuePipeline);
    
    if (!revenueData) {
      return {
        period,
        totalRevenue: 0,
        periodRevenue: 0,
        totalCustomers: 0,
        payingCustomers: 0,
        payingCustomerRate: 0,
        lastUpdated: new Date()
      };
    }

    const payingCustomerRate = revenueData.totalCustomers > 0
      ? (revenueData.payingCustomers / revenueData.totalCustomers * 100)
      : 0;

    return {
      period,
      totalRevenue: Math.round(revenueData.totalRevenue || 0),
      periodRevenue: Math.round(revenueData.periodRevenue || 0),
      totalCustomers: revenueData.totalCustomers || 0,
      payingCustomers: revenueData.payingCustomers || 0,
      payingCustomerRate: Math.round(payingCustomerRate * 100) / 100,
      lastUpdated: new Date()
    };
  } catch (error) {
    throw new Error(`Failed to fetch revenue analytics: ${error.message}`);
  }
};

module.exports = {
  getRegularCustomers,
  getCustomerTypeBreakdown,
  getCustomerActivityReport,
  getRevenueAnalytics
};