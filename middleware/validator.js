const { z } = require('zod');

const schemas = {
  download: z.object({
    videoId: z.string().min(1, 'videoId is required'),
    format: z.enum(['mp3', 'mp4'], { 
      errorMap: () => ({ message: 'format must be mp3 or mp4' })
    }),
    quality: z.string().refine(
      (val) => {
        // For mp3: must match pattern like "128kbps", "192kbps", etc.
        // For mp4: must match pattern like "360p", "720p", etc.
        return /^\d+kbps$/.test(val) || /^\d+p$/.test(val);
      },
      { message: 'quality must be in format "128kbps" or "720p"' }
    )
  }).refine(
    (data) => {
      // Additional validation: mp3 should have kbps, mp4 should have p
      if (data.format === 'mp3' && !/^\d+kbps$/.test(data.quality)) {
        return false;
      }
      if (data.format === 'mp4' && !/^\d+p$/.test(data.quality)) {
        return false;
      }
      return true;
    },
    { message: 'quality format does not match the selected format type' }
  )
};

function validate(schemaName) {
  return (req, res, next) => {
    try {
      const schema = schemas[schemaName];
      if (!schema) {
        throw new Error(`Schema ${schemaName} not found`);
      }
      
      req.validatedData = schema.parse(req.body);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  validate,
  schemas
};