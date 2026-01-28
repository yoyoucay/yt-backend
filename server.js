const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const config = require('./config/config');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');
const rateLimiter = require('./middleware/rateLimiter');
const searchRoutes = require('./routes/search');
const downloadRoutes = require('./routes/download');

const app = express();

// Create downloads folder if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
  logger.info('Created downloads directory');
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(rateLimiter);

// Request logging
app.use((req, res, next) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip }, 'Incoming request');
  next();
});

// Routes
app.get('/', (req, res) => {
  res.json({ status: 'ok', message: 'YouTube Downloader API is running' });
});

app.use('/api/search', searchRoutes);
app.use('/api/download', downloadRoutes);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.PORT, () => {
  logger.info(`Server running on port ${config.PORT}`);
  logger.info(`Environment: ${config.NODE_ENV}`);
});