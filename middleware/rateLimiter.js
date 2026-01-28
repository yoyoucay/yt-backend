const config = require('../config/config');
const logger = require('../utils/logger');

// In-memory storage for rate limiting
const requestCounts = new Map();
const downloadCounts = new Map();

function rateLimiter(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();
  const windowMs = config.RATE_LIMIT.WINDOW_MS;

  // Clean up old entries
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.firstRequest > windowMs) {
      requestCounts.delete(key);
    }
  }

  // Get or create request count for this IP
  let ipData = requestCounts.get(ip);
  
  if (!ipData || now - ipData.firstRequest > windowMs) {
    // New window
    ipData = {
      count: 1,
      firstRequest: now
    };
    requestCounts.set(ip, ipData);
  } else {
    // Existing window
    ipData.count++;
    
    if (ipData.count > config.RATE_LIMIT.MAX_REQUESTS) {
      logger.warn({ ip, count: ipData.count }, 'Rate limit exceeded');
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please try again later'
      });
    }
  }

  // Check concurrent downloads for POST /api/download
  if (req.method === 'POST' && req.path.includes('/download')) {
    const activeDownloads = downloadCounts.get(ip) || 0;
    
    if (activeDownloads >= config.RATE_LIMIT.MAX_CONCURRENT_DOWNLOADS) {
      logger.warn({ ip, activeDownloads }, 'Concurrent download limit exceeded');
      return res.status(429).json({
        error: 'Too many concurrent downloads',
        message: `Maximum ${config.RATE_LIMIT.MAX_CONCURRENT_DOWNLOADS} concurrent downloads per IP`
      });
    }
  }

  next();
}

// Helper functions to manage download counts
function incrementDownloadCount(ip) {
  const current = downloadCounts.get(ip) || 0;
  downloadCounts.set(ip, current + 1);
}

function decrementDownloadCount(ip) {
  const current = downloadCounts.get(ip) || 0;
  if (current > 0) {
    downloadCounts.set(ip, current - 1);
  }
}

module.exports = rateLimiter;
module.exports.incrementDownloadCount = incrementDownloadCount;
module.exports.decrementDownloadCount = decrementDownloadCount;