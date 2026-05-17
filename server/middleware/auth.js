const crypto = require('crypto');

const Session = require('../models/Session');
const User = require('../models/User');
const cacheService = require('../services/cacheService');

const SESSION_COOKIE_NAME = 'vaaniarc_session';
const CSRF_COOKIE_NAME = 'vaaniarc_csrf';
const DEFAULT_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const getCookieSameSite = () => {
  const configuredPolicy = String(process.env.SESSION_COOKIE_SAMESITE || 'strict').trim().toLowerCase();

  if (configuredPolicy === 'none') {
    return isProduction() ? 'none' : 'lax';
  }

  if (configuredPolicy === 'lax') {
    return 'lax';
  }

  return 'strict';
};

const parseCookieHeader = (cookieHeader = '') => cookieHeader
  .split(';')
  .map((segment) => segment.trim())
  .filter(Boolean)
  .reduce((cookies, segment) => {
    const separatorIndex = segment.indexOf('=');

    if (separatorIndex <= 0) {
      return cookies;
    }

    const key = segment.slice(0, separatorIndex).trim();
    const value = segment.slice(separatorIndex + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }

    return cookies;
  }, {});

const hashToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''))
  .digest('hex');

const generateOpaqueToken = () => crypto.randomBytes(32).toString('base64url');

const getSessionDurationMs = () => {
  const parsedDuration = Number.parseInt(process.env.SESSION_DURATION_MS || '', 10);
  return Number.isFinite(parsedDuration) && parsedDuration > 0
    ? parsedDuration
    : DEFAULT_SESSION_DURATION_MS;
};

const isProduction = () => process.env.NODE_ENV === 'production';

const getRequestIp = (req) => {
  const forwardedFor = req?.headers?.['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req?.ip || req?.socket?.remoteAddress || req?.connection?.remoteAddress || null;
};

const getRequestDeviceId = (req) => {
  const headerDeviceId = req?.headers?.['x-device-id'];
  if (typeof headerDeviceId === 'string' && headerDeviceId.trim()) {
    return headerDeviceId.trim();
  }

  return crypto.randomUUID();
};

const getSessionCookieOptions = (expiresAt) => ({
  httpOnly: true,
  secure: isProduction() || getCookieSameSite() === 'none',
  sameSite: getCookieSameSite(),
  path: '/',
  expires: expiresAt
});

const getCsrfCookieOptions = (expiresAt) => ({
  httpOnly: false,
  secure: isProduction() || getCookieSameSite() === 'none',
  sameSite: getCookieSameSite(),
  path: '/',
  expires: expiresAt
});

const setSessionCookies = (res, { sessionToken, csrfToken, expiresAt }) => {
  res.cookie(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions(expiresAt));
  res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions(expiresAt));
};

const clearSessionCookies = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction() || getCookieSameSite() === 'none',
    sameSite: getCookieSameSite(),
    path: '/'
  });
  res.clearCookie(CSRF_COOKIE_NAME, {
    httpOnly: false,
    secure: isProduction() || getCookieSameSite() === 'none',
    sameSite: getCookieSameSite(),
    path: '/'
  });
};

const getSessionTtlMs = (session) => {
  const expiresAtMs = new Date(session?.expiresAt || Date.now()).getTime();
  return Math.max(1000, expiresAtMs - Date.now());
};

const buildCachedSession = (session) => ({
  _id: session?._id?.toString?.() || session?._id || null,
  user: session?.user?._id?.toString?.() || session?.user?.toString?.() || session?.user || null,
  deviceId: session?.deviceId || null,
  tokenHash: session?.tokenHash || null,
  csrfTokenHash: session?.csrfTokenHash || null,
  userAgent: session?.userAgent || '',
  ipAddress: session?.ipAddress || null,
  lastSeenAt: session?.lastSeenAt || null,
  expiresAt: session?.expiresAt || null,
  revokedAt: session?.revokedAt || null
});

const cacheSessionRecord = async (session) => {
  if (!session?.tokenHash) {
    return;
  }

  await cacheService.session.set(
    session.tokenHash,
    buildCachedSession(session),
    getSessionTtlMs(session)
  );
};

const createSession = async ({ userId, req, deviceId = null }) => {
  const sessionToken = generateOpaqueToken();
  const csrfToken = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + getSessionDurationMs());
  const resolvedDeviceId = deviceId || getRequestDeviceId(req);
  const existingSessions = await Session.find({
    user: userId,
    deviceId: resolvedDeviceId,
    revokedAt: null
  }).select('tokenHash');

  await Session.updateMany(
    {
      user: userId,
      deviceId: resolvedDeviceId,
      revokedAt: null
    },
    {
      $set: {
        revokedAt: new Date()
      }
    }
  );

  await Promise.all(
    existingSessions.map((session) => cacheService.session.delete(session.tokenHash))
  );

  const session = await Session.create({
    user: userId,
    deviceId: resolvedDeviceId,
    tokenHash: hashToken(sessionToken),
    csrfTokenHash: hashToken(csrfToken),
    userAgent: req?.headers?.['user-agent'] || '',
    ipAddress: getRequestIp(req),
    lastSeenAt: new Date(),
    expiresAt
  });

  await cacheSessionRecord(session);

  return {
    session,
    sessionToken,
    csrfToken
  };
};

const revokeSession = async (session) => {
  if (!session || session.revokedAt) {
    return;
  }

  if (typeof session.save === 'function') {
    session.revokedAt = new Date();
    await session.save();
  } else {
    await Session.updateOne(
      {
        tokenHash: session.tokenHash,
        revokedAt: null
      },
      {
        $set: {
          revokedAt: new Date()
        }
      }
    );
  }

  if (session.tokenHash) {
    await cacheService.session.delete(session.tokenHash);
  }
};

const touchSession = async (session, req) => {
  if (!session) {
    return;
  }

  const now = Date.now();
  const lastSeenAt = session.lastSeenAt ? new Date(session.lastSeenAt).getTime() : 0;
  if (now - lastSeenAt < SESSION_TOUCH_INTERVAL_MS) {
    return;
  }

  if (typeof session.save === 'function') {
    session.lastSeenAt = new Date(now);
    session.ipAddress = getRequestIp(req);
    await session.save();
    await cacheSessionRecord(session);
    return;
  }

  const nextSession = {
    ...session,
    lastSeenAt: new Date(now),
    ipAddress: getRequestIp(req)
  };

  await Session.updateOne(
    {
      tokenHash: session.tokenHash,
      revokedAt: null
    },
    {
      $set: {
        lastSeenAt: nextSession.lastSeenAt,
        ipAddress: nextSession.ipAddress
      }
    }
  );

  await cacheSessionRecord(nextSession);
  Object.assign(session, nextSession);
};

const updateRequestSessionDeviceId = async (req, nextDeviceId) => {
  const normalizedDeviceId = typeof nextDeviceId === 'string' && nextDeviceId.trim()
    ? nextDeviceId.trim()
    : null;

  if (!req?.session || !normalizedDeviceId || req.session.deviceId === normalizedDeviceId) {
    if (normalizedDeviceId) {
      req.deviceId = normalizedDeviceId;
    }
    return;
  }

  if (typeof req.session.save === 'function') {
    req.session.deviceId = normalizedDeviceId;
    await req.session.save();
    await cacheSessionRecord(req.session);
  } else if (req.session.tokenHash) {
    const nextSession = {
      ...req.session,
      deviceId: normalizedDeviceId
    };

    await Session.updateOne(
      {
        tokenHash: req.session.tokenHash,
        revokedAt: null
      },
      {
        $set: {
          deviceId: normalizedDeviceId
        }
      }
    );

    await cacheSessionRecord(nextSession);
    Object.assign(req.session, nextSession);
  }

  req.deviceId = normalizedDeviceId;
};

const loadUserForSessionToken = async (sessionToken) => {
  if (!sessionToken) {
    return null;
  }

  const tokenHash = hashToken(sessionToken);
  const cachedSession = await cacheService.session.get(tokenHash);
  let session = cachedSession;

  if (!session) {
    session = await Session.findOne({
      tokenHash,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    });

    if (!session) {
      return null;
    }

    await cacheSessionRecord(session);
  }

  const user = await User.findById(session.user).select('-password');
  if (!user || !user.isActive) {
    await revokeSession(session);
    return null;
  }

  return {
    authStrategy: 'session',
    session,
    user
  };
};

const attachAuthContext = async (req, authContext) => {
  req.user = authContext.user;
  req.session = authContext.session || null;
  req.authStrategy = authContext.authStrategy;
  req.deviceId = authContext.session?.deviceId || req.headers['x-device-id'] || null;

  if (authContext.session) {
    await touchSession(authContext.session, req);
  }
};

const getAuthFailure = () => ({ status: 401, body: { message: 'Authentication required.' } });

const resolveAuthentication = async (req) => {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const sessionAuth = await loadUserForSessionToken(cookies[SESSION_COOKIE_NAME] || null);
  if (sessionAuth) {
    return sessionAuth;
  }

  return null;
};

const authenticateToken = async (req, res, next) => {
  try {
    const authContext = await resolveAuthentication(req);

    if (!authContext) {
      const failure = getAuthFailure(req);
      return res.status(failure.status).json(failure.body);
    }

    await attachAuthContext(req, authContext);
    return next();
  } catch (error) {
    const failure = getAuthFailure(req, error);
    return res.status(failure.status).json(failure.body);
  }
};

const optionalAuth = async (req, res, next) => {
  try {
    const authContext = await resolveAuthentication(req);

    if (authContext) {
      await attachAuthContext(req, authContext);
    }

    return next();
  } catch (error) {
    return next();
  }
};

const requireCsrf = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  if (!req.session || req.authStrategy !== 'session') {
    return res.status(403).json({ message: 'CSRF token required' });
  }

  const cookies = parseCookieHeader(req.headers.cookie || '');
  const cookieToken = cookies[CSRF_COOKIE_NAME] || null;
  const headerToken = typeof req.headers['x-csrf-token'] === 'string'
    ? req.headers['x-csrf-token'].trim()
    : '';

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF token required' });
  }

  if (hashToken(headerToken) !== req.session.csrfTokenHash) {
    return res.status(403).json({ message: 'Invalid CSRF token' });
  }

  return next();
};

authenticateToken.COOKIE_NAMES = {
  SESSION_COOKIE_NAME,
  CSRF_COOKIE_NAME
};
authenticateToken.clearSessionCookies = clearSessionCookies;
authenticateToken.createSession = createSession;
authenticateToken.getRequestDeviceId = getRequestDeviceId;
authenticateToken.getRequestIp = getRequestIp;
authenticateToken.optionalAuth = optionalAuth;
authenticateToken.parseCookieHeader = parseCookieHeader;
authenticateToken.requireCsrf = requireCsrf;
authenticateToken.revokeSession = revokeSession;
authenticateToken.resolveAuthentication = resolveAuthentication;
authenticateToken.setSessionCookies = setSessionCookies;
authenticateToken.updateRequestSessionDeviceId = updateRequestSessionDeviceId;

module.exports = authenticateToken;
