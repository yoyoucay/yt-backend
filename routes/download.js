const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { validate } = require('../middleware/validator');
const downloadManager = require('../services/downloadManager');
const logger = require('../utils/logger');
const { incrementDownloadCount, decrementDownloadCount } = require('../middleware/rateLimiter');

// POST /api/download - Start a new download
router.post('/', validate('download'), async (req, res, next) => {
  try {
    const { videoId, format, quality } = req.validatedData;
    const ip = req.ip || req.connection.remoteAddress;

    // Create download job
    const downloadId = downloadManager.createDownload(videoId, format, quality, videoId);

    // Start download asynchronously
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    incrementDownloadCount(ip);

    // Don't await - run in background
    downloadManager.startDownload(downloadId, videoUrl)
      .finally(() => {
        decrementDownloadCount(ip);
      });

    res.json({
      downloadId,
      status: 'processing'
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/download/:id/progress - Get download progress
router.get('/:id/progress', (req, res, next) => {
  try {
    const { id } = req.params;
    
    const download = downloadManager.getDownload(id);
    
    if (!download) {
      return res.status(404).json({
        error: 'Download not found'
      });
    }

    res.json(download);
  } catch (error) {
    next(error);
  }
});

// GET /api/download/:id - Download the file
router.get('/:id', (req, res, next) => {
  try {
    const { id } = req.params;

    const download = downloadManager.getDownload(id);
    
    if (!download) {
      return res.status(404).json({
        error: 'Download not found'
      });
    }

    if (download.status === 'pending' || download.status === 'downloading') {
      return res.status(400).json({
        error: 'Download not ready',
        status: download.status,
        progress: download.progress
      });
    }

    if (download.status === 'failed') {
      return res.status(400).json({
        error: 'Download failed',
        message: download.error
      });
    }

    // Check if file exists
    if (!downloadManager.isFileReady(id)) {
      return res.status(404).json({
        error: 'File not found or has been deleted'
      });
    }

    const fileInfo = downloadManager.getFileInfo(id);
    
    // Set headers for file download
    const mimeType = fileInfo.format === 'mp3' ? 'audio/mpeg' : 'video/mp4';
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileInfo.filename}"`);

    // Stream file to client
    const fileStream = fs.createReadStream(fileInfo.filePath);
    
    fileStream.on('error', (error) => {
      logger.error({ error: error.message, downloadId: id }, 'Error streaming file');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream file' });
      }
    });

    fileStream.on('end', () => {
      logger.info({ downloadId: id }, 'File streamed successfully');
      // Delete file immediately after streaming
      downloadManager.cleanup(id);
    });

    fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;