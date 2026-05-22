/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const SENSITIVE_KEY_PATTERN = /token|secret|password|authorization|cookie|csrf|credential|session|otp|totp|key/i;

const sanitizeError = (error) => ({
  name: error.name,
  message: error.message,
  code: error.code,
  status: error.status || error.statusCode
});

const sanitizeValue = (value, depth = 0) => {
  if (value instanceof Error) {
    return sanitizeError(value);
  }

  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (depth >= 3) {
    return '[Object]';
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((entry) => sanitizeValue(entry, depth + 1));
  }

  return Object.entries(value).reduce((nextValue, [key, entryValue]) => {
    nextValue[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? '[REDACTED]'
      : sanitizeValue(entryValue, depth + 1);
    return nextValue;
  }, {});
};

const sanitizeArgs = (args) => args.map((arg) => sanitizeValue(arg));

const logger = {
  info: (message, ...args) => {
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...sanitizeArgs(args));
  },
  error: (message, ...args) => {
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...sanitizeArgs(args));
  },
  warn: (message, ...args) => {
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...sanitizeArgs(args));
  },
  debug: (message, ...args) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...sanitizeArgs(args));
    }
  }
};

module.exports = logger;
