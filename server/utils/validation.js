/**
 * Validation utility functions
 */

/**
 * Validate email format
 * @param {string} email - Email address to validate
 * @returns {boolean} - Whether email is valid
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Validate username
 * @param {string} username - Username to validate
 * @returns {Object} - Validation result with isValid and error message
 */
const validateUsername = (username) => {
  if (!username || typeof username !== 'string') {
    return { isValid: false, error: 'Username is required' };
  }
  
  const trimmed = username.trim();
  
  if (trimmed.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters long' };
  }
  
  if (trimmed.length > 30) {
    return { isValid: false, error: 'Username must be 30 characters or less' };
  }
  
  // Allow letters, numbers, underscore, hyphen
  const usernameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!usernameRegex.test(trimmed)) {
    return { isValid: false, error: 'Username can only contain letters, numbers, underscores, and hyphens' };
  }
  
  return { isValid: true };
};

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} - Validation result with isValid, strength, and error message
 */
const validatePassword = (password) => {
  if (!password) {
    return { isValid: false, strength: 'none', error: 'Password is required' };
  }
  
  if (password.length < 6) {
    return { isValid: false, strength: 'weak', error: 'Password must be at least 6 characters long' };
  }
  
  let strength = 'weak';
  let score = 0;
  
  // Length check
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  
  // Complexity checks
  if (/[a-z]/.test(password)) score += 1;
  if (/[A-Z]/.test(password)) score += 1;
  if (/[0-9]/.test(password)) score += 1;
  if (/[^a-zA-Z0-9]/.test(password)) score += 1;
  
  if (score >= 5) {
    strength = 'strong';
  } else if (score >= 3) {
    strength = 'medium';
  }
  
  return { isValid: true, strength };
};

/**
 * Validate message content
 * @param {string} content - Message content to validate
 * @param {number} maxLength - Maximum allowed length (default: 2000)
 * @returns {Object} - Validation result with isValid and error message
 */
const validateMessageContent = (content, maxLength = 2000) => {
  if (!content || typeof content !== 'string') {
    return { isValid: false, error: 'Message content is required' };
  }
  
  const trimmed = content.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Message cannot be empty' };
  }
  
  if (trimmed.length > maxLength) {
    return { isValid: false, error: `Message must be ${maxLength} characters or less` };
  }
  
  return { isValid: true };
};

/**
 * Validate room name
 * @param {string} name - Room name to validate
 * @returns {Object} - Validation result with isValid and error message
 */
const validateRoomName = (name) => {
  if (!name || typeof name !== 'string') {
    return { isValid: false, error: 'Room name is required' };
  }
  
  const trimmed = name.trim();
  
  if (trimmed.length === 0) {
    return { isValid: false, error: 'Room name cannot be empty' };
  }
  
  if (trimmed.length > 50) {
    return { isValid: false, error: 'Room name must be 50 characters or less' };
  }
  
  return { isValid: true };
};

/**
 * Validate bio/description
 * @param {string} bio - Bio text to validate
 * @param {number} maxLength - Maximum allowed length (default: 200)
 * @returns {Object} - Validation result with isValid and error message
 */
const validateBio = (bio, maxLength = 200) => {
  if (!bio) {
    return { isValid: true }; // Bio is optional
  }
  
  if (typeof bio !== 'string') {
    return { isValid: false, error: 'Bio must be text' };
  }
  
  if (bio.length > maxLength) {
    return { isValid: false, error: `Bio must be ${maxLength} characters or less` };
  }
  
  return { isValid: true };
};

/**
 * Sanitize input to prevent XSS attacks
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Validate MongoDB ObjectId format
 * @param {string} id - ID to validate
 * @returns {boolean} - Whether ID is valid
 */
const isValidObjectId = (id) => {
  if (!id || typeof id !== 'string') return false;
  return /^[0-9a-fA-F]{24}$/.test(id);
};

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean} - Whether URL is valid
 */
const isValidUrl = (url) => {
  try {
    new URL(url);
    return true;
  } catch (error) {
    return false;
  }
};

/**
 * Validate room settings
 * @param {Object} settings - Room settings to validate
 * @returns {Object} - Validation result with isValid and error message
 */
const validateRoomSettings = (settings) => {
  if (!settings || typeof settings !== 'object') {
    return { isValid: false, error: 'Settings must be an object' };
  }
  
  const validKeys = ['allowFileSharing', 'allowInvites', 'muteNotifications'];
  const invalidKeys = Object.keys(settings).filter(key => !validKeys.includes(key));
  
  if (invalidKeys.length > 0) {
    return { isValid: false, error: `Invalid setting keys: ${invalidKeys.join(', ')}` };
  }
  
  // Validate values are boolean
  for (const key of Object.keys(settings)) {
    if (typeof settings[key] !== 'boolean') {
      return { isValid: false, error: `Setting ${key} must be a boolean` };
    }
  }
  
  return { isValid: true };
};

/**
 * Validate role
 * @param {string} role - Role to validate
 * @returns {Object} - Validation result with isValid and error message
 */
const validateRole = (role) => {
  const validRoles = ['member', 'moderator', 'admin'];
  
  if (!validRoles.includes(role)) {
    return { isValid: false, error: 'Invalid role. Must be one of: member, moderator, admin' };
  }
  
  return { isValid: true };
};

/**
 * Validate user status
 * @param {string} status - Status to validate
 * @returns {Object} - Validation result with isValid and error message
 */
const validateStatus = (status) => {
  const validStatuses = ['online', 'offline', 'away', 'busy'];
  
  if (!validStatuses.includes(status)) {
    return { isValid: false, error: 'Invalid status. Must be one of: online, offline, away, busy' };
  }
  
  return { isValid: true };
};

module.exports = {
  isValidEmail,
  validateUsername,
  validatePassword,
  validateMessageContent,
  validateRoomName,
  validateBio,
  sanitizeInput,
  isValidObjectId,
  isValidUrl,
  validateRoomSettings,
  validateRole,
  validateStatus
};
