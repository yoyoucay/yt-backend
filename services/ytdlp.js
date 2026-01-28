const { spawn } = require('child_process');
const logger = require('../utils/logger');
const config = require('../config/config');

class YtDlpService {
  getRandomUserAgent() {
    const userAgents = config.YTDLP.USER_AGENTS;
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  /**
   * Get video info using yt-dlp --dump-json
   */
  async getVideoInfo(url) {
    return new Promise((resolve, reject) => {
      const args = [
        '--dump-json',
        '--no-playlist',
        '--user-agent', this.getRandomUserAgent(),
        '--extractor-args', 'youtube:player_client=android,web',
        '--no-check-certificate',
        url
      ];

      logger.debug({ url, args }, 'Getting video info');

      const process = spawn('yt-dlp', args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code !== 0) {
          logger.error({ code, stderr, url }, 'yt-dlp failed to get video info');
          return reject(new Error(`Failed to get video info: ${stderr}`));
        }

        try {
          const info = JSON.parse(stdout);
          resolve(this.parseVideoInfo(info));
        } catch (error) {
          logger.error({ error, stdout }, 'Failed to parse video info');
          reject(new Error('Failed to parse video info'));
        }
      });

      process.on('error', (error) => {
        logger.error({ error }, 'Failed to spawn yt-dlp');
        reject(new Error('yt-dlp not found. Please install yt-dlp'));
      });
    });
  }

  /**
   * Parse video info and extract available formats
   */
  parseVideoInfo(info) {
    const videoFormats = new Set();
    const audioFormats = new Set();

    if (info.formats) {
      info.formats.forEach(format => {
        // Video formats
        if (format.height && format.vcodec !== 'none') {
          videoFormats.add(`${format.height}p`);
        }
        // Audio formats
        if (format.abr && format.acodec !== 'none') {
          audioFormats.add(`${Math.round(format.abr)}kbps`);
        }
      });
    }

    return {
      id: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: this.formatDuration(info.duration),
      channel: info.uploader || info.channel,
      url: info.webpage_url,
      availableFormats: {
        video: Array.from(videoFormats).sort((a, b) => {
          return parseInt(a) - parseInt(b);
        }),
        audio: Array.from(audioFormats).sort((a, b) => {
          return parseInt(a) - parseInt(b);
        })
      }
    };
  }

  formatDuration(seconds) {
    if (!seconds) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Download video/audio with progress tracking
   */
  async download(url, format, quality, outputPath, onProgress) {
    let retries = 0;
    const maxRetries = config.YTDLP.MAX_RETRIES;

    const attemptDownload = async () => {
      return new Promise((resolve, reject) => {
        const args = this.buildDownloadArgs(url, format, quality, outputPath);
        
        logger.info({ url, format, quality, outputPath, retries }, 'Starting download');

        const process = spawn('yt-dlp', args);
        let stderr = '';

        process.stdout.on('data', (data) => {
          const output = data.toString();
          const progress = this.parseProgress(output);
          
          if (progress && onProgress) {
            onProgress(progress);
          }
        });

        process.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        process.on('close', async (code) => {
          if (code !== 0) {
            const error = stderr || 'Download failed';
            logger.error({ code, stderr, url, retries }, 'Download failed');

            // Retry on 403 errors
            if (stderr.includes('403') && retries < maxRetries) {
              retries++;
              const delay = config.YTDLP.RETRY_DELAY * Math.pow(2, retries - 1);
              logger.info({ retries, delay }, 'Retrying download after delay');
              
              await new Promise(resolve => setTimeout(resolve, delay));
              return attemptDownload().then(resolve).catch(reject);
            }

            return reject(new Error(error));
          }

          logger.info({ outputPath }, 'Download completed successfully');
          resolve(outputPath);
        });

        process.on('error', (error) => {
          logger.error({ error }, 'Failed to spawn yt-dlp');
          reject(new Error('yt-dlp not found. Please install yt-dlp'));
        });
      });
    };

    return attemptDownload();
  }

  buildDownloadArgs(url, format, quality, outputPath) {
    const args = [
      '--no-playlist',
      '--user-agent', this.getRandomUserAgent(),
      '--newline',
      '-o', outputPath,
      '--extractor-args', 'youtube:player_client=android,web',
      '--no-check-certificate',
      '--prefer-free-formats'
    ];

    if (format === 'mp3') {
      // Extract audio and convert to mp3
      const bitrate = quality.replace('kbps', '');
      args.push(
        '-f', 'bestaudio',
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', bitrate + 'K'
      );
    } else if (format === 'mp4') {
      // Download video in specified quality
      const height = quality.replace('p', '');
      args.push(
        '-f', `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]`,
        '--merge-output-format', 'mp4'
      );
    }

    args.push(url);
    return args;
  }

  parseProgress(output) {
    // Parse yt-dlp progress output
    // Example: [download]  45.0% of 10.5MiB at 1.2MiB/s ETA 00:05
    const match = output.match(/\[download\]\s+(\d+\.?\d*)%/);
    if (match) {
      return parseFloat(match[1]);
    }
    return null;
  }
}

module.exports = new YtDlpService();