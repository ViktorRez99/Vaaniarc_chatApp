const SENSITIVE_KEY_PATTERN = /authorization|cookie|csrf|credential|otp|passkey|password|secret|session|token|totp|key/i;

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

const installSafeConsole = () => {
  if (console.__vaaniArcSafeConsoleInstalled) {
    return;
  }

  ['error', 'warn', 'log', 'debug'].forEach((method) => {
    const originalMethod = console[method].bind(console);
    console[method] = (...args) => originalMethod(...sanitizeArgs(args));
  });

  Object.defineProperty(console, '__vaaniArcSafeConsoleInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false
  });
};

module.exports = {
  installSafeConsole,
  sanitizeArgs,
  sanitizeValue
};
