const DEVICE_ID_STORAGE_KEY = 'vaaniarc_device_id';

const BROWSER_MATCHERS = [
  { label: 'Edge', pattern: /Edg\//i },
  { label: 'Opera', pattern: /OPR\//i },
  { label: 'Chrome', pattern: /Chrome\//i },
  { label: 'Safari', pattern: /Safari\//i },
  { label: 'Firefox', pattern: /Firefox\//i }
];

const PLATFORM_MATCHERS = [
  { label: 'Windows', pattern: /Windows/i },
  { label: 'macOS', pattern: /Mac OS X|Macintosh/i },
  { label: 'Android', pattern: /Android/i },
  { label: 'iPhone', pattern: /iPhone/i },
  { label: 'iPad', pattern: /iPad/i },
  { label: 'Linux', pattern: /Linux/i }
];

const canUseBrowserStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const generateDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const getOrCreateDeviceId = () => {
  if (!canUseBrowserStorage()) {
    return null;
  }

  const storedDeviceId = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (storedDeviceId) {
    return storedDeviceId;
  }

  const nextDeviceId = generateDeviceId();
  localStorage.setItem(DEVICE_ID_STORAGE_KEY, nextDeviceId);
  return nextDeviceId;
};

const matchLabel = (source, matchers, fallback) => {
  if (!source) {
    return fallback;
  }

  const match = matchers.find(({ pattern }) => pattern.test(source));
  return match?.label || fallback;
};

export const getCurrentDeviceSnapshot = () => {
  const deviceId = getOrCreateDeviceId();
  const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const browser = matchLabel(userAgent, BROWSER_MATCHERS, 'Browser');
  const platform = matchLabel(userAgent, PLATFORM_MATCHERS, 'Unknown Device');

  return {
    deviceId,
    deviceName: `${browser} on ${platform}`,
    browser,
    platform,
    userAgent
  };
};
