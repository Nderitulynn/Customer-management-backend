const moment = require('moment-timezone');

/**
 * Date Range Utilities
 */

/**
 * Validates and parses date range from various input formats
 * @param {string|Date} startDate - Start date
 * @param {string|Date} endDate - End date  
 * @param {string} period - Preset period (7d, 30d, 90d, 6m, 1y)
 * @param {string} timezone - Timezone for date calculations
 * @returns {Object} Validated date range object
 */
function validateDateRange(startDate, endDate, period = null, timezone = 'UTC') {
  let start, end;
  
  try {
    if (period && !startDate && !endDate) {
      // Use preset period
      const periodMap = {
        '7d': 7,
        '30d': 30,
        '90d': 90,
        '6m': 180,
        '1y': 365
      };
      
      const days = periodMap[period];
      if (!days) {
        throw new Error(`Invalid period: ${period}`);
      }
      
      end = moment().tz(timezone).endOf('day').toDate();
      start = moment().tz(timezone).subtract(days, 'days').startOf('day').toDate();
    } else {
      // Parse provided dates
      start = startDate ? moment.tz(startDate, timezone).startOf('day').toDate() : null;
      end = endDate ? moment.tz(endDate, timezone).endOf('day').toDate() : null;
      
      if (!start || !end) {
        throw new Error('Both startDate and endDate are required when not using period');
      }
      
      if (start >= end) {
        throw new Error('Start date must be before end date');
      }
      
      // Check maximum date range (e.g., 2 years)
      const maxDays = 730; // 2 years
      const daysDiff = moment(end).diff(moment(start), 'days');
      if (daysDiff > maxDays) {
        throw new Error(`Date range cannot exceed ${maxDays} days`);
      }
    }
    
    return {
      start,
      end,
      period: period || 'custom',
      timezone,
      days: moment(end).diff(moment(start), 'days') + 1
    };
  } catch (error) {
    const err = new Error(`Invalid date range: ${error.message}`);
    err.code = 'INVALID_DATE_RANGE';
    throw err;
  }
}

/**
 * Generates date intervals for grouping data
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @param {string} interval - Interval type (day, week, month, quarter, year)
 * @param {string} timezone - Timezone for calculations
 * @returns {Array} Array of date intervals
 */
function generateDateIntervals(startDate, endDate, interval = 'day', timezone = 'UTC') {
  const intervals = [];
  const start = moment.tz(startDate, timezone);
  const end = moment.tz(endDate, timezone);
  
  let current = start.clone();
  const intervalMap = {
    day: 'day',
    week: 'week', 
    month: 'month',
    quarter: 'quarter',
    year: 'year'
  };
  
  const unit = intervalMap[interval];
  if (!unit) {
    throw new Error(`Invalid interval: ${interval}`);
  }
  
  while (current.isSameOrBefore(end)) {
    const intervalStart = current.clone().startOf(unit);
    const intervalEnd = current.clone().endOf(unit);
    
    // Don't go beyond the requested end date
    if (intervalEnd.isAfter(end)) {
      intervalEnd.set(end.toObject());
    }
    
    intervals.push({
      start: intervalStart.toDate(),
      end: intervalEnd.toDate(),
      label: formatDateLabel(intervalStart, interval),
      key: intervalStart.format('YYYY-MM-DD')
    });
    
    current.add(1, unit);
  }
  
  return intervals;
}

/**
 * Formats date labels for display
 * @param {moment.Moment} date - Moment date object
 * @param {string} interval - Interval type
 * @returns {string} Formatted label
 */
function formatDateLabel(date, interval) {
  const formats = {
    day: 'MMM DD',
    week: 'MMM DD, YYYY',
    month: 'MMM YYYY',
    quarter: '[Q]Q YYYY',
    year: 'YYYY'
  };
  
  return date.format(formats[interval] || 'MMM DD, YYYY');
}

/**
 * Data Aggregation Helpers
 */

/**
 * Aggregates data by specified field with sum, count, and average
 * @param {Array} data - Array of data objects
 * @param {string} groupByField - Field to group by
 * @param {string} valueField - Field to aggregate
 * @param {Array} aggregations - Types of aggregations ['sum', 'count', 'avg', 'min', 'max']
 * @returns {Object} Aggregated results
 */
function aggregateData(data, groupByField, valueField, aggregations = ['sum', 'count']) {
  if (!Array.isArray(data) || data.length === 0) {
    return {};
  }
  
  const grouped = {};
  
  data.forEach(item => {
    const key = item[groupByField];
    if (key === undefined || key === null) return;
    
    if (!grouped[key]) {
      grouped[key] = {
        items: [],
        values: []
      };
    }
    
    grouped[key].items.push(item);
    if (valueField && item[valueField] !== undefined) {
      grouped[key].values.push(Number(item[valueField]) || 0);
    }
  });
  
  // Calculate aggregations
  const results = {};
  Object.keys(grouped).forEach(key => {
    const group = grouped[key];
    results[key] = {
      group: key,
      count: group.items.length
    };
    
    if (group.values.length > 0 && aggregations.length > 0) {
      if (aggregations.includes('sum')) {
        results[key].sum = group.values.reduce((acc, val) => acc + val, 0);
      }
      
      if (aggregations.includes('avg')) {
        results[key].avg = group.values.reduce((acc, val) => acc + val, 0) / group.values.length;
      }
      
      if (aggregations.includes('min')) {
        results[key].min = Math.min(...group.values);
      }
      
      if (aggregations.includes('max')) {
        results[key].max = Math.max(...group.values);
      }
    }
    
    // Add original items for further processing if needed
    results[key].items = group.items;
  });
  
  return results;
}

/**
 * Calculates growth rate between two values
 * @param {number} previousValue - Previous period value
 * @param {number} currentValue - Current period value
 * @returns {number} Growth rate as percentage
 */
function calculateGrowthRate(previousValue, currentValue) {
  if (!previousValue || previousValue === 0) {
    return currentValue > 0 ? 100 : 0;
  }
  
  return ((currentValue - previousValue) / previousValue) * 100;
}

/**
 * Calculates percentage change between two values
 * @param {number} oldValue - Original value
 * @param {number} newValue - New value
 * @returns {Object} Change object with value and percentage
 */
function calculatePercentageChange(oldValue, newValue) {
  const change = newValue - oldValue;
  const percentage = oldValue === 0 ? (newValue > 0 ? 100 : 0) : (change / oldValue) * 100;
  
  return {
    change,
    percentage: Math.round(percentage * 100) / 100,
    direction: change > 0 ? 'up' : change < 0 ? 'down' : 'stable'
  };
}

/**
 * Aggregates data by time period
 * @param {Array} data - Array of data with date field
 * @param {string} dateField - Name of the date field
 * @param {string} valueField - Name of the value field to aggregate
 * @param {string} interval - Time interval (day, week, month)
 * @param {string} timezone - Timezone for date calculations
 * @returns {Array} Time-aggregated data
 */
function aggregateByTimePeriod(data, dateField, valueField, interval = 'day', timezone = 'UTC') {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  const grouped = {};
  
  data.forEach(item => {
    const date = moment.tz(item[dateField], timezone);
    const key = date.startOf(interval).format('YYYY-MM-DD');
    
    if (!grouped[key]) {
      grouped[key] = {
        date: date.startOf(interval).toDate(),
        values: [],
        count: 0
      };
    }
    
    if (item[valueField] !== undefined) {
      grouped[key].values.push(Number(item[valueField]) || 0);
    }
    grouped[key].count++;
  });
  
  return Object.keys(grouped)
    .sort()
    .map(key => ({
      date: grouped[key].date,
      period: key,
      sum: grouped[key].values.reduce((acc, val) => acc + val, 0),
      avg: grouped[key].values.length > 0 
        ? grouped[key].values.reduce((acc, val) => acc + val, 0) / grouped[key].values.length 
        : 0,
      count: grouped[key].count,
      min: grouped[key].values.length > 0 ? Math.min(...grouped[key].values) : 0,
      max: grouped[key].values.length > 0 ? Math.max(...grouped[key].values) : 0
    }));
}

/**
 * Chart Data Formatting Functions
 */

/**
 * Formats data for line charts
 * @param {Array} data - Time series data
 * @param {string} xField - X-axis field name
 * @param {string} yField - Y-axis field name  
 * @param {string} label - Dataset label
 * @returns {Object} Chart.js compatible data structure
 */
function formatLineChartData(data, xField, yField, label = 'Data') {
  return {
    labels: data.map(item => item[xField]),
    datasets: [{
      label,
      data: data.map(item => item[yField]),
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      tension: 0.4,
      fill: true
    }]
  };
}

/**
 * Formats data for bar charts
 * @param {Array} data - Data array
 * @param {string} labelField - Field for labels
 * @param {string} valueField - Field for values
 * @param {Object} options - Formatting options
 * @returns {Object} Chart.js compatible data structure
 */
function formatBarChartData(data, labelField, valueField, options = {}) {
  const {
    backgroundColor = '#3B82F6',
    borderColor = '#1D4ED8',
    label = 'Data'
  } = options;
  
  return {
    labels: data.map(item => item[labelField]),
    datasets: [{
      label,
      data: data.map(item => item[valueField]),
      backgroundColor,
      borderColor,
      borderWidth: 1
    }]
  };
}

/**
 * Formats data for pie charts
 * @param {Array} data - Data array
 * @param {string} labelField - Field for labels
 * @param {string} valueField - Field for values
 * @returns {Object} Chart.js compatible data structure
 */
function formatPieChartData(data, labelField, valueField) {
  const colors = [
    '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ];
  
  return {
    labels: data.map(item => item[labelField]),
    datasets: [{
      data: data.map(item => item[valueField]),
      backgroundColor: colors.slice(0, data.length),
      borderWidth: 2,
      borderColor: '#FFFFFF'
    }]
  };
}

/**
 * Formats multi-series data for charts
 * @param {Array} data - Data array
 * @param {string} xField - X-axis field
 * @param {Array} series - Array of series configurations
 * @returns {Object} Multi-series chart data
 */
function formatMultiSeriesData(data, xField, series) {
  const labels = [...new Set(data.map(item => item[xField]))].sort();
  
  const datasets = series.map((serie, index) => {
    const serieData = labels.map(label => {
      const item = data.find(d => d[xField] === label);
      return item ? item[serie.field] : 0;
    });
    
    return {
      label: serie.label,
      data: serieData,
      borderColor: serie.color || `hsl(${index * 60}, 70%, 50%)`,
      backgroundColor: serie.backgroundColor || `hsla(${index * 60}, 70%, 50%, 0.1)`,
      tension: 0.4
    };
  });
  
  return { labels, datasets };
}

/**
 * CSV Export Utilities
 */

/**
 * Converts array of objects to CSV string
 * @param {Array} data - Array of objects
 * @param {Array} columns - Column configurations
 * @param {Object} options - Export options
 * @returns {string} CSV string
 */
function convertToCSV(data, columns = null, options = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return '';
  }
  
  const {
    delimiter = ',',
    includeHeaders = true,
    dateFormat = 'YYYY-MM-DD HH:mm:ss',
    nullValue = '',
    booleanFormat = { true: 'Yes', false: 'No' }
  } = options;
  
  // Auto-detect columns if not provided
  if (!columns) {
    const firstItem = data[0];
    columns = Object.keys(firstItem).map(key => ({
      field: key,
      header: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
    }));
  }
  
  const csvRows = [];
  
  // Add headers if requested
  if (includeHeaders) {
    const headers = columns.map(col => `"${col.header}"`);
    csvRows.push(headers.join(delimiter));
  }
  
  // Add data rows
  data.forEach(item => {
    const row = columns.map(col => {
      let value = item[col.field];
      
      // Handle different data types
      if (value === null || value === undefined) {
        value = nullValue;
      } else if (typeof value === 'boolean') {
        value = booleanFormat[value];
      } else if (value instanceof Date) {
        value = moment(value).format(dateFormat);
      } else if (typeof value === 'string') {
        // Escape quotes and wrap in quotes if contains delimiter
        value = value.replace(/"/g, '""');
        if (value.includes(delimiter) || value.includes('\n') || value.includes('"')) {
          value = `"${value}"`;
        }
      } else if (typeof value === 'number') {
        // Handle potential locale-specific number formatting
        value = value.toString();
      } else {
        value = String(value);
      }
      
      return value;
    });
    
    csvRows.push(row.join(delimiter));
  });
  
  return csvRows.join('\n');
}

/**
 * Creates CSV column configuration from data structure
 * @param {Array} data - Sample data
 * @param {Object} fieldMappings - Field name mappings
 * @returns {Array} Column configurations
 */
function createCSVColumns(data, fieldMappings = {}) {
  if (!Array.isArray(data) || data.length === 0) {
    return [];
  }
  
  const sample = data[0];
  const columns = [];
  
  Object.keys(sample).forEach(field => {
    const value = sample[field];
    let type = 'string';
    
    if (typeof value === 'number') type = 'number';
    else if (typeof value === 'boolean') type = 'boolean';
    else if (value instanceof Date) type = 'date';
    
    columns.push({
      field,
      header: fieldMappings[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1'),
      type
    });
  });
  
  return columns;
}

/**
 * Formats currency values
 * @param {number} value - Numeric value
 * @param {string} currency - Currency code
 * @param {string} locale - Locale for formatting
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, currency = 'USD', locale = 'en-US') {
  if (typeof value !== 'number' || isNaN(value)) {
    return '$0.00';
  }
  
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(value);
  } catch (error) {
    // Fallback formatting
    return `$${value.toFixed(2)}`;
  }
}

/**
 * Formats large numbers with appropriate suffixes
 * @param {number} value - Numeric value
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted number string
 */
function formatLargeNumber(value, decimals = 1) {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0';
  }
  
  const suffixes = ['', 'K', 'M', 'B', 'T'];
  const tier = Math.log10(Math.abs(value)) / 3 | 0;
  
  if (tier === 0) return value.toString();
  
  const suffix = suffixes[tier];
  const scale = Math.pow(10, tier * 3);
  const scaled = value / scale;
  
  return scaled.toFixed(decimals) + suffix;
}

/**
 * Standardized response formatter
 * @param {boolean} success - Operation success status
 * @param {any} data - Response data
 * @param {string} message - Response message
 * @param {string} error - Error message
 * @returns {Object} Formatted response object
 */
function formatResponse(success, data = null, message = '', error = null) {
  return {
    success,
    data,
    message,
    error,
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  // Date utilities
  validateDateRange,
  generateDateIntervals,
  formatDateLabel,
  
  // Data aggregation
  aggregateData,
  calculateGrowthRate,
  calculatePercentageChange,
  aggregateByTimePeriod,
  
  // Chart formatting
  formatLineChartData,
  formatBarChartData,
  formatPieChartData,
  formatMultiSeriesData,
  
  // CSV utilities
  convertToCSV,
  createCSVColumns,
  
  // Formatting utilities
  formatCurrency,
  formatLargeNumber,
  formatResponse
};