const path = require('path');

/**
 * Get file type category based on mime type
 * @param {string} mimetype - The mime type of the file
 * @returns {string} - Category: 'image', 'video', 'audio', 'document', 'other'
 */
const getFileCategory = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  
  const documentTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ];
  
  if (documentTypes.includes(mimetype)) return 'document';
  
  return 'other';
};

/**
 * Get file icon based on file type
 * @param {string} mimetype - The mime type of the file
 * @returns {string} - Icon name/emoji
 */
const getFileIcon = (mimetype) => {
  const category = getFileCategory(mimetype);
  
  switch (category) {
    case 'image':
      return '🖼️';
    case 'video':
      return '🎥';
    case 'audio':
      return '🎵';
    case 'document':
      if (mimetype.includes('pdf')) return '📄';
      if (mimetype.includes('word')) return '📝';
      if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) return '📊';
      if (mimetype.includes('powerpoint') || mimetype.includes('presentation')) return '📽️';
      return '📄';
    default:
      return '📎';
  }
};

/**
 * Format file size to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} - Formatted file size
 */
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

/**
 * Validate file type
 * @param {string} mimetype - The mime type of the file
 * @param {string[]} allowedTypes - Array of allowed mime types
 * @returns {boolean} - Whether file type is allowed
 */
const validateFileType = (mimetype, allowedTypes) => {
  return allowedTypes.includes(mimetype);
};

/**
 * Validate file size
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum allowed size in bytes
 * @returns {boolean} - Whether file size is within limit
 */
const validateFileSize = (size, maxSize) => {
  return size <= maxSize;
};

/**
 * Get file extension from filename
 * @param {string} filename - The filename
 * @returns {string} - File extension (lowercase, without dot)
 */
const getFileExtension = (filename) => {
  return path.extname(filename).toLowerCase().slice(1);
};

/**
 * Check if file is an image
 * @param {string} mimetype - The mime type of the file
 * @returns {boolean} - Whether file is an image
 */
const isImage = (mimetype) => {
  return mimetype.startsWith('image/');
};

/**
 * Check if file is a video
 * @param {string} mimetype - The mime type of the file
 * @returns {boolean} - Whether file is a video
 */
const isVideo = (mimetype) => {
  return mimetype.startsWith('video/');
};

/**
 * Check if file is a document
 * @param {string} mimetype - The mime type of the file
 * @returns {boolean} - Whether file is a document
 */
const isDocument = (mimetype) => {
  return getFileCategory(mimetype) === 'document';
};

/**
 * Sanitize filename to prevent security issues
 * @param {string} filename - The original filename
 * @returns {string} - Sanitized filename
 */
const sanitizeFilename = (filename) => {
  // Remove path separators and other potentially dangerous characters
  return filename
    .replace(/[\/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '_')
    .toLowerCase();
};

/**
 * Generate safe unique filename
 * @param {string} originalFilename - The original filename
 * @returns {string} - Safe unique filename
 */
const generateSafeFilename = (originalFilename) => {
  const ext = getFileExtension(originalFilename);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(7);
  const baseName = sanitizeFilename(path.basename(originalFilename, path.extname(originalFilename)));
  
  return `${baseName}_${timestamp}_${random}.${ext}`;
};

/**
 * Get preview-able file types
 * @returns {Object} - Object with arrays of preview-able mime types
 */
const getPreviewableTypes = () => {
  return {
    images: [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml'
    ],
    videos: [
      'video/mp4',
      'video/webm',
      'video/ogg'
    ],
    audio: [
      'audio/mp3',
      'audio/mpeg',
      'audio/ogg',
      'audio/wav',
      'audio/webm'
    ],
    documents: [
      'application/pdf',
      'text/plain'
    ]
  };
};

/**
 * Check if file can be previewed
 * @param {string} mimetype - The mime type of the file
 * @returns {boolean} - Whether file can be previewed
 */
const canPreview = (mimetype) => {
  const previewable = getPreviewableTypes();
  return [
    ...previewable.images,
    ...previewable.videos,
    ...previewable.audio,
    ...previewable.documents
  ].includes(mimetype);
};

module.exports = {
  getFileCategory,
  getFileIcon,
  formatFileSize,
  validateFileType,
  validateFileSize,
  getFileExtension,
  isImage,
  isVideo,
  isDocument,
  sanitizeFilename,
  generateSafeFilename,
  getPreviewableTypes,
  canPreview
};
