const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../config/config');
const ytdlpService = require('./ytdlp');
const { sanitizeFilename } = require('../utils/sanitize');

class DownloadManager {
  constructor() {
    // In-memory storage using Map
    this.downloads = new Map();
  }

  /**
   * Create a new download job
   */
  createDownload(videoId, format, quality, videoTitle = 'video') {
    const downloadId = uuidv4();
    const sanitizedTitle = sanitizeFilename(videoTitle);
    const extension = format === 'mp3' ? 'mp3' : 'mp4';
    const filename = `${sanitizedTitle}_${downloadId}.${extension}`;
    const filePath = path.join(config.DOWNLOADS_DIR, filename);

    const download = {
      downloadId,
      videoId,
      format,
      quality,
      status: 'pending',
      progress: 0,
      error: null,
      filePath,
      filename,
      createdAt: Date.now(),
      timeoutId: null
    };

    this.downloads.set(downloadId, download);
    logger.info({ downloadId, videoId, format, quality }, 'Download job created');

    return downloadId;
  }

  /**
   * Start download process
   */
  async startDownload(downloadId, videoUrl) {
    const download = this.downloads.get(downloadId);
    if (!download) {
      throw new Error('Download not found');
    }

    try {
      download.status = 'downloading';
      logger.info({ downloadId, videoUrl }, 'Starting download process');

      await ytdlpService.download(
        videoUrl,
        download.format,
        download.quality,
        download.filePath,
        (progress) => {
          download.progress = Math.min(100, Math.max(0, progress));
          logger.debug({ downloadId, progress: download.progress }, 'Download progress');
        }
      );

      download.status = 'completed';
      download.progress = 100;
      logger.info({ downloadId }, 'Download completed');

      // Set cleanup timeout
      this.scheduleCleanup(downloadId);

    } catch (error) {
      download.status = 'failed';
      download.error = error.message;
      logger.error({ downloadId, error: error.message }, 'Download failed');
      
      // Clean up failed download
      this.scheduleCleanup(downloadId, 60000); // Clean up after 1 minute
    }
  }

  /**
   * Schedule file cleanup after timeout
   */
  scheduleCleanup(downloadId, timeout = config.FILE_CLEANUP_TIMEOUT) {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    // Clear existing timeout if any
    if (download.timeoutId) {
      clearTimeout(download.timeoutId);
    }

    download.timeoutId = setTimeout(() => {
      this.cleanup(downloadId);
    }, timeout);

    logger.debug({ downloadId, timeout }, 'Cleanup scheduled');
  }

  /**
   * Clean up download and delete file
   */
  cleanup(downloadId) {
    const download = this.downloads.get(downloadId);
    if (!download) return;

    logger.info({ downloadId, filePath: download.filePath }, 'Cleaning up download');

    // Delete file if exists
    if (fs.existsSync(download.filePath)) {
      try {
        fs.unlinkSync(download.filePath);
        logger.info({ downloadId, filePath: download.filePath }, 'File deleted');
      } catch (error) {
        logger.error({ downloadId, error: error.message }, 'Failed to delete file');
      }
    }

    // Clear timeout
    if (download.timeoutId) {
      clearTimeout(download.timeoutId);
    }

    // Remove from map
    this.downloads.delete(downloadId);
    logger.info({ downloadId }, 'Download job removed from memory');
  }

  /**
   * Get download status
   */
  getDownload(downloadId) {
    const download = this.downloads.get(downloadId);
    if (!download) {
      return null;
    }

    return {
      downloadId: download.downloadId,
      status: download.status,
      progress: download.progress,
      error: download.error,
      filePath: download.status === 'completed' ? download.filePath : null
    };
  }

  /**
   * Check if file exists and is ready
   */
  isFileReady(downloadId) {
    const download = this.downloads.get(downloadId);
    if (!download || download.status !== 'completed') {
      return false;
    }

    return fs.existsSync(download.filePath);
  }

  /**
   * Get file info for streaming
   */
  getFileInfo(downloadId) {
    const download = this.downloads.get(downloadId);
    if (!download) {
      return null;
    }

    return {
      filePath: download.filePath,
      filename: download.filename,
      format: download.format
    };
  }
}

module.exports = new DownloadManager();