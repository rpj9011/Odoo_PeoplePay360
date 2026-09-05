// frontend/src/utils/currencyFormatter.js

/**
 * Formats a number to Indian Rupee currency format
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted currency string (e.g., "₹5,92,700.00")
 */
export const formatINR = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '₹0.00';
  }
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

/**
 * Formats a number to Indian Rupee currency format without decimal places
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted currency string (e.g., "₹5,92,700")
 */
export const formatINRCompact = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '₹0';
  }
  
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
};

/**
 * Formats a number to Indian Rupee currency format with K, L, Cr suffixes
 * @param {number} value - The numeric value to format
 * @returns {string} Formatted currency string (e.g., "₹5.93L", "₹59.27Cr")
 */
export const formatINRShort = (value) => {
  if (value === null || value === undefined || isNaN(value)) {
    return '₹0';
  }
  
  const absValue = Math.abs(value);
  
  if (absValue >= 10000000) { // 1 Crore
    return '₹' + (value / 10000000).toFixed(2) + 'Cr';
  } else if (absValue >= 100000) { // 1 Lakh
    return '₹' + (value / 100000).toFixed(2) + 'L';
  } else if (absValue >= 1000) { // 1 Thousand
    return '₹' + (value / 1000).toFixed(0) + 'K';
  } else {
    return formatINRCompact(value);
  }
};

export default formatINR;
