const path = require('path');

/**
 * Sanitize filename to prevent directory traversal and invalid characters
 */
function sanitizeFilename(filename) {
  if (!filename || typeof filename !== 'string') {
    return 'download';
  }

  // Remove path separators and dangerous characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\.\./g, '')
    .trim();

  // Remove leading/trailing dots and spaces
  sanitized = sanitized.replace(/^[\s.]+|[\s.]+$/g, '');

  // Limit length
  const maxLength = 200;
  if (sanitized.length > maxLength) {
    const ext = path.extname(sanitized);
    const base = path.basename(sanitized, ext);
    sanitized = base.substring(0, maxLength - ext.length) + ext;
  }

  // Fallback if empty
  return sanitized || 'download';
}

module.exports = {
  sanitizeFilename
};