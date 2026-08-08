/**
 * Indian currency parser utility
 * Handles: "25 lakhs", "1.2 cr", "₹4,00,000", "6.5L", "INR 15,00,000"
 */
function parseINR(text) {
  if (!text || typeof text !== 'string') return null;

  const t = text.toLowerCase().replace(/[₹,\s]/g, '');

  // crore patterns: "1.2cr", "1.2crore", "1.2crores"
  const croreMatch = t.match(/(\d+\.?\d*)\s*cr(?:ore)?s?/);
  if (croreMatch) return Math.round(parseFloat(croreMatch[1]) * 10_000_000);

  // lakh patterns: "25l", "25lakh", "25lakhs", "25lac", "25lacs"
  const lakhMatch = t.match(/(\d+\.?\d*)\s*(?:l(?:akh)?s?|lac(?:s)?)/);
  if (lakhMatch) return Math.round(parseFloat(lakhMatch[1]) * 100_000);

  // Plain number after removing separators (commas already stripped)
  const plainMatch = t.match(/\d+\.?\d*/);
  if (plainMatch) {
    const val = parseFloat(plainMatch[0]);
    // Only return if it looks like a meaningful amount (>= 1000)
    return val >= 1000 ? Math.round(val) : null;
  }

  return null;
}

/**
 * Try to find and parse INR value from email body text
 */
function extractDealValue(text) {
  if (!text) return null;

  // Look for currency patterns in the text
  const patterns = [
    // ₹ / Rs / INR followed by amount
    /(?:₹|rs\.?|inr)\s*[\d,]+(?:\.\d+)?\s*(?:cr(?:ore)?s?|l(?:akh)?s?|lac(?:s)?)?/gi,
    // Amount followed by lakh/crore
    /[\d,]+(?:\.\d+)?\s*(?:cr(?:ore)?s?|l(?:akh)?s?|lac(?:s)?)/gi,
  ];

  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches && matches.length > 0) {
      const parsed = parseINR(matches[0]);
      if (parsed && parsed >= 10000) return parsed; // Minimum meaningful deal value
    }
  }

  return null;
}

module.exports = { parseINR, extractDealValue };
