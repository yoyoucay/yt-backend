const express = require('express');
const router = express.Router();
const GetListByKeyword = require('youtube-search-api').GetListByKeyword;
const ytdlpService = require('../services/ytdlp');
const logger = require('../utils/logger');

// Detect if query is a YouTube URL
function isYouTubeUrl(query) {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
  return youtubeRegex.test(query);
}

// Extract video ID from URL
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
    /youtube\.com\/v\/([^&\n?#]+)/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

router.get('/', async (req, res, next) => {
  try {
    const query = req.query.q;

    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({
        error: 'Query parameter "q" is required'
      });
    }

    logger.info({ query }, 'Search request');

    // Check if query is a YouTube URL
    if (isYouTubeUrl(query)) {
      // Direct URL - get video info and available formats
      try {
        const videoInfo = await ytdlpService.getVideoInfo(query);
        
        return res.json({
          videos: [videoInfo]
        });
      } catch (error) {
        logger.error({ error: error.message, query }, 'Failed to get video info from URL');
        return res.status(400).json({
          error: 'Failed to get video information',
          message: error.message
        });
      }
    } else {
      // Text search using youtube-search-api
      try {
        const searchResults = await GetListByKeyword(query, false, 10);
        
        if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
          return res.json({ videos: [] });
        }

        // Transform results to our format
        const videos = searchResults.items
          .filter(item => item.type === 'video')
          .map(item => ({
            id: item.id,
            title: item.title,
            thumbnail: item.thumbnail?.thumbnails?.[0]?.url || '',
            duration: item.length?.simpleText || 'Unknown',
            channel: item.channelTitle,
            url: `https://www.youtube.com/watch?v=${item.id}`,
            availableFormats: {
              video: ['360p', '480p', '720p', '1080p'],
              audio: ['128kbps', '192kbps', '256kbps', '320kbps']
            }
          }));

        return res.json({ videos });
      } catch (error) {
        logger.error({ error: error.message, query }, 'Search failed');
        return res.status(500).json({
          error: 'Search failed',
          message: error.message
        });
      }
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;