import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react';
import apiService from '../services/api';
import socketService from '../services/socket';
import passkeyService from '../services/passkeys';
import runtimeCoordinator from '../services/runtimeCoordinator';
import {
  clearServerPushSubscription,
  syncPushSubscription
} from '../services/notifications';

let loadedCryptoService = null;
let cryptoServicePromise = null;

const loadCryptoService = async () => {
  if (loadedCryptoService) {
    return loadedCryptoService;
  }

  if (!cryptoServicePromise) {
    cryptoServicePromise = import('../services/cryptoService')
      .then((module) => {
        loadedCryptoService = module.default;
        return loadedCryptoService;
      })
      .catch((error) => {
        cryptoServicePromise = null;
        throw error;
      });
  }

  return cryptoServicePromise;
};

const clearLoadedCryptoIdentity = () => {
  if (loadedCryptoService) {
    loadedCryptoService.clearActiveIdentity();
  }
};

const buildSignedOutEncryptionState = () => ({
  status: 'signed_out',
  message: 'Sign in to enable end-to-end encryption.'
});

const SESSION_RESTORE_RETRY_DELAYS_MS = [500, 1000, 1500, 2500, 3500, 5000];
const SESSION_RESTORE_RECOVERING_MESSAGE = 'The backend is restarting. Restoring your session as soon as it becomes reachable.';
const SESSION_RESTORE_UNAVAILABLE_MESSAGE = 'The backend is still unavailable. Retry once the server finishes restarting.';

const createRuntimeIssue = ({
  category,
  message,
  rawMessage = null,
  statusCode = null,
  details = null,
  retryable = true,
  source = 'bootstrap'
}) => ({
  category,
  message,
  rawMessage: rawMessage || message,
  statusCode,
  details,
  retryable,
  source
});

const ISSUE_PRIORITY = {
  session: 1,
  database: 2,
  api: 3,
  device: 4,
  encryption: 5,
  realtime: 6,
  runtime: 7
};

const pickRuntimeIssue = (currentIssue, nextIssue) => {
  if (!nextIssue) {
    return currentIssue;
  }

  if (!currentIssue) {
    return nextIssue;
  }

  return (ISSUE_PRIORITY[nextIssue.category] || 99) < (ISSUE_PRIORITY[currentIssue.category] || 99)
    ? nextIssue
    : currentIssue;
};

const classifyBootstrapError = (error, fallbackCategory = 'runtime') => {
  const rawMessage = String(
    error?.responseBody?.message
    || error?.message
    || 'Runtime initialization failed.'
  );
  const normalizedMessage = rawMessage.toLowerCase();
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : null;
  const details = error?.responseBody || null;

  let category = fallbackCategory;
  let message = rawMessage;
  let retryable = true;

  if (statusCode === 503 || error?.category === 'database' || /database unavailable|mongodb|mongo/.test(normalizedMessage)) {
    category = 'database';
    message = 'The API is reachable, but the database is still reconnecting.';
  } else if (
    error?.responseBody?.code === 'PASSKEY_REQUIRED'
    || error?.responseBody?.passkeyRequired
    || /passkey setup is required|passkey required/.test(normalizedMessage)
  ) {
    category = 'session';
    message = 'Set up a passkey before using VaaniArc.';
    retryable = false;
  } else if (
    statusCode === 401
    || (statusCode === 403 && /csrf/.test(normalizedMessage))
    || error?.category === 'session'
    || /session expired|sign in again|csrf token required|invalid csrf token/.test(normalizedMessage)
  ) {
    category = 'session';
    message = statusCode === 401
      ? 'Your session expired. Please sign in again.'
      : 'Your authenticated session is missing secure cookies. Refresh and sign in again.';
    retryable = statusCode !== 401;
  } else if (error?.category === 'network' || /failed to fetch|unable to connect|networkerror|backend connection|offline/.test(normalizedMessage)) {
    category = 'api';
    message = 'The frontend cannot reach the backend right now.';
  } else if (error?.category === 'device' || /device not registered|failed to register device|device id/.test(normalizedMessage)) {
    category = 'device';
    message = 'This browser could not finish secure device registration yet.';
  } else if (
    error?.category === 'encryption'
    || /encryption|prekey|fingerprint|identity|key bundle|key mismatch|backup import/.test(normalizedMessage)
  ) {
    category = 'encryption';
    message = rawMessage || 'Secure messaging could not finish setting up on this browser.';
  } else if (error?.category === 'realtime' || /realtime|socket|polling|websocket/.test(normalizedMessage)) {
    category = 'realtime';
    message = 'Realtime sync is unavailable right now.';
  }

  return createRuntimeIssue({
    category,
    message,
    rawMessage,
    statusCode,
    details,
    retryable
  });
};

const getEncryptionIssue = (nextEncryptionState) => {
  if (!nextEncryptionState || nextEncryptionState.status === 'ready' || nextEncryptionState.status === 'signed_out') {
    return null;
  }

  return createRuntimeIssue({
    category: 'encryption',
    message: nextEncryptionState.message || 'Secure messaging is not ready on this browser.',
    rawMessage: nextEncryptionState.message || 'Secure messaging is not ready on this browser.',
    retryable: nextEncryptionState.status !== 'unsupported'
  });
};

const isMissingSessionError = (error) => /authentication required|session required|access token or session required|session expired/i.test(
  String(error?.message || '')
);

const isDeviceIdClaimedError = (error) => (
  error?.statusCode === 409
  && (
    error?.responseBody?.code === 'DEVICE_ID_CLAIMED'
    || /device id is already linked to another account/i.test(String(error?.message || ''))
  )
);

const isTransientSessionRestoreError = (error) => {
  const normalizedMessage = String(error?.message || '').toLowerCase();

  return error?.category === 'network'
    || error?.category === 'database'
    || error?.category === 'server'
    || error?.statusCode === 503
    || /failed to fetch|unable to connect|backend connection|database unavailable|server is not responding correctly|invalid response format|networkerror|offline/.test(normalizedMessage);
};

const userRequiresPasskeyEnrollment = (user) => Boolean(user?.passkeyRequired);
const normalizeAuthUser = (user) => {
  if (!user) {
    return user;
  }

  const normalizedId = String(user._id || user.id || '');
  return {
    ...user,
    _id: normalizedId,
    id: normalizedId
  };
};

const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null
};

const AUTH_ACTIONS = {
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  REGISTER_START: 'REGISTER_START',
  REGISTER_SUCCESS: 'REGISTER_SUCCESS',
  REGISTER_FAILURE: 'REGISTER_FAILURE',
  UPDATE_PROFILE: 'UPDATE_PROFILE',
  CLEAR_ERROR: 'CLEAR_ERROR',
  SET_LOADING: 'SET_LOADING'
};

const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
    case AUTH_ACTIONS.REGISTER_START:
      return {
        ...state,
        isLoading: true,
        error: null
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS:
    case AUTH_ACTIONS.REGISTER_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null
      };

    case AUTH_ACTIONS.LOGIN_FAILURE:
    case AUTH_ACTIONS.REGISTER_FAILURE:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload
      };

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null
      };

    case AUTH_ACTIONS.UPDATE_PROFILE:
      return {
        ...state,
        user: { ...state.user, ...action.payload }
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };

    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload
      };

    default:
      return state;
  }
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(apiService.getCurrentDeviceId());
  const [encryptionState, setEncryptionState] = useState(buildSignedOutEncryptionState());
  const [bootstrapStatus, setBootstrapStatus] = useState('idle');
  const [bootstrapIssue, setBootstrapIssue] = useState(null);
  const [bootstrapError, setBootstrapError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState(socketService.getStatusSnapshot().status);
  const [realtimeError, setRealtimeError] = useState(null);
  const [sessionRestoreStatus, setSessionRestoreStatus] = useState('idle');
  const [sessionRestoreMessage, setSessionRestoreMessage] = useState('');
  const [isDeviceResetPromptOpen, setIsDeviceResetPromptOpen] = useState(false);
  const [isResettingDeviceEncryption, setIsResettingDeviceEncryption] = useState(false);
  const [deviceResetError, setDeviceResetError] = useState('');
  const bootstrapRunIdRef = useRef(0);
  const mountedRef = useRef(true);
  const currentUserRef = useRef(null);
  const sessionRestorePromiseRef = useRef(null);

  const applyIfCurrent = useCallback((runId, callback) => {
    if (mountedRef.current && bootstrapRunIdRef.current === runId) {
      callback();
    }
  }, []);

  const clearSessionRestoreState = useCallback(() => {
    setSessionRestoreStatus('idle');
    setSessionRestoreMessage('');
  }, []);

  const resetRuntimeState = useCallback(() => {
    bootstrapRunIdRef.current += 1;
    setDevices([]);
    setCurrentDeviceId(apiService.getCurrentDeviceId());
    setEncryptionState(buildSignedOutEncryptionState());
    setBootstrapStatus('idle');
    setBootstrapIssue(null);
    setBootstrapError(null);
    setRealtimeStatus('idle');
    setRealtimeError(null);
    setIsDeviceResetPromptOpen(false);
    setIsResettingDeviceEncryption(false);
    setDeviceResetError('');
  }, []);

  const syncEncryptionState = useCallback(async (nextUser) => {
    const cryptoService = await loadCryptoService();
    const resolvedState = await cryptoService.ensureIdentity(nextUser);
    setEncryptionState(resolvedState);
    return resolvedState;
  }, []);

  const registerAndLoadCurrentDevice = useCallback(async (identityState) => {
    await apiService.waitForCsrfCookie();
    await apiService.registerCurrentDevice(identityState);
    const response = await apiService.getDevices();
    setDevices(response.devices || []);
    setCurrentDeviceId(response.currentDeviceId || apiService.getCurrentDeviceId());
    return response.devices || [];
  }, []);

  const syncExistingPushSubscription = useCallback(async () => {
    try {
      await syncPushSubscription({ requestPermission: false });
    } catch (error) {
      console.warn('Push subscription sync failed:', error);
    }
  }, []);

  const runRuntimeBootstrap = useCallback(async (nextUser, options = {}) => {
    const {
      reason = 'manual'
    } = options;
    const resolvedUser = nextUser || currentUserRef.current;
    const userId = resolvedUser?._id || resolvedUser?.id;

    if (!userId) {
      resetRuntimeState();
      return null;
    }

    const runId = ++bootstrapRunIdRef.current;
    applyIfCurrent(runId, () => {
      setBootstrapStatus('running');
      setBootstrapIssue(null);
      setBootstrapError(null);
    });

    let resolvedIssue = null;
    let resolvedEncryptionState = buildSignedOutEncryptionState();
    let deviceRegistrationReady = false;

    try {
      resolvedEncryptionState = await syncEncryptionState(resolvedUser);
      resolvedIssue = pickRuntimeIssue(resolvedIssue, getEncryptionIssue(resolvedEncryptionState));

      try {
        await registerAndLoadCurrentDevice(resolvedEncryptionState);
        deviceRegistrationReady = true;
      } catch (deviceError) {
        if (isDeviceIdClaimedError(deviceError)) {
          console.warn('Current browser device ID belongs to another account. Rotating device ID and rebuilding local encryption identity.');
          apiService.rotateCurrentDeviceId();
          applyIfCurrent(runId, () => {
            setCurrentDeviceId(apiService.getCurrentDeviceId());
          });

          try {
            resolvedEncryptionState = await syncEncryptionState(resolvedUser);
            resolvedIssue = pickRuntimeIssue(resolvedIssue, getEncryptionIssue(resolvedEncryptionState));
            await registerAndLoadCurrentDevice(resolvedEncryptionState);
            deviceRegistrationReady = true;
          } catch (repairError) {
            console.warn('Device bootstrap repair failed:', repairError);
            resolvedIssue = pickRuntimeIssue(
              resolvedIssue,
              classifyBootstrapError(repairError, 'device')
            );
            applyIfCurrent(runId, () => {
              setDevices([]);
            });
          }
        } else {
          console.warn('Device bootstrap failed:', deviceError);
          resolvedIssue = pickRuntimeIssue(
            resolvedIssue,
            classifyBootstrapError(deviceError, 'device')
          );
          applyIfCurrent(runId, () => {
            setDevices([]);
          });
        }
      }

      if (deviceRegistrationReady) {
        await syncExistingPushSubscription();

        try {
          await socketService.connect({
            waitForConnection: true,
            timeoutMs: 5000
          });
        } catch (socketError) {
          console.warn('Realtime bootstrap failed:', socketError);
          resolvedIssue = pickRuntimeIssue(
            resolvedIssue,
            classifyBootstrapError(socketError, 'realtime')
          );
        }
      } else {
        socketService.disconnect();
      }
    } catch (bootstrapErrorValue) {
      console.warn(`Runtime bootstrap degraded during ${reason}:`, bootstrapErrorValue);
      resolvedIssue = pickRuntimeIssue(
        resolvedIssue,
        classifyBootstrapError(bootstrapErrorValue, resolvedIssue?.category || 'runtime')
      );
    }

    applyIfCurrent(runId, () => {
      if (resolvedIssue) {
        setBootstrapStatus('degraded');
        setBootstrapIssue(resolvedIssue);
        setBootstrapError(resolvedIssue.message);
      } else {
        setBootstrapStatus('ready');
        setBootstrapIssue(null);
        setBootstrapError(null);
      }
    });

    return {
      encryptionState: resolvedEncryptionState,
      issue: resolvedIssue
    };
  }, [
    applyIfCurrent,
    registerAndLoadCurrentDevice,
    resetRuntimeState,
    syncEncryptionState,
    syncExistingPushSubscription
  ]);

  const scheduleRuntimeBootstrap = useCallback((nextUser, options = {}) => {
    void runRuntimeBootstrap(nextUser, options);
  }, [runRuntimeBootstrap]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      bootstrapRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    currentUserRef.current = state.user;
  }, [state.user]);

  useEffect(() => {
    return socketService.subscribeStatus((snapshot) => {
      setRealtimeStatus(snapshot.status);
      setRealtimeError(snapshot.error?.message || null);
    });
  }, []);

  useEffect(() => {
    if (!state.isAuthenticated) {
      return;
    }

    if (realtimeStatus === 'connected' && bootstrapIssue?.category === 'realtime') {
      setBootstrapStatus('ready');
      setBootstrapIssue(null);
      setBootstrapError(null);
    }
  }, [bootstrapIssue, realtimeStatus, state.isAuthenticated]);

  const markSessionMissing = useCallback(() => {
    socketService.disconnect();
    clearLoadedCryptoIdentity();
    clearSessionRestoreState();
    resetRuntimeState();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
  }, [clearSessionRestoreState, resetRuntimeState]);

  const markSessionRestoreUnavailable = useCallback((message = SESSION_RESTORE_UNAVAILABLE_MESSAGE) => {
    socketService.disconnect();
    clearLoadedCryptoIdentity();
    resetRuntimeState();
    setSessionRestoreStatus('unavailable');
    setSessionRestoreMessage(message);
    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
  }, [resetRuntimeState]);

  const performSessionRestore = useCallback(async () => {
    if (sessionRestorePromiseRef.current) {
      return sessionRestorePromiseRef.current;
    }

    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    setSessionRestoreStatus('checking');
    setSessionRestoreMessage('');

    const restorePromise = (async () => {
      if (!apiService.hasCsrfToken()) {
        markSessionMissing();
        return null;
      }

      const completeSessionRestore = async () => {
        const response = await apiService.verifyToken();

        if (!mountedRef.current) {
          return null;
        }

        clearSessionRestoreState();
        const nextUser = normalizeAuthUser(response.user);
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user: nextUser }
        });
        if (!userRequiresPasskeyEnrollment(nextUser)) {
          scheduleRuntimeBootstrap(nextUser, { reason: 'session-restore' });
        } else {
          resetRuntimeState();
        }
        return response;
      };

      try {
        return await completeSessionRestore();
      } catch (error) {
        if (!mountedRef.current) {
          return null;
        }

        if (isMissingSessionError(error)) {
          markSessionMissing();
          return null;
        }

        if (!isTransientSessionRestoreError(error)) {
          console.warn('Session verification failed:', error);
          markSessionRestoreUnavailable(error.message || 'Session verification failed.');
          return null;
        }
      }

      console.warn('Session verification delayed while the backend recovers.');
      setSessionRestoreStatus('recovering');
      setSessionRestoreMessage(SESSION_RESTORE_RECOVERING_MESSAGE);

      for (const delayMs of SESSION_RESTORE_RETRY_DELAYS_MS) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, delayMs);
        });

        if (!mountedRef.current) {
          return null;
        }

        try {
          await apiService.getHealthReadiness();
        } catch (readinessError) {
          if (!mountedRef.current) {
            return null;
          }

          if (isMissingSessionError(readinessError)) {
            markSessionMissing();
            return null;
          }

          if (isTransientSessionRestoreError(readinessError) || readinessError?.statusCode === 503) {
            continue;
          }

          console.warn('Backend readiness check failed:', readinessError);
          markSessionRestoreUnavailable(
            readinessError.message || SESSION_RESTORE_UNAVAILABLE_MESSAGE
          );
          return null;
        }

        try {
          return await completeSessionRestore();
        } catch (verifyError) {
          if (!mountedRef.current) {
            return null;
          }

          if (isMissingSessionError(verifyError)) {
            markSessionMissing();
            return null;
          }

          if (isTransientSessionRestoreError(verifyError)) {
            continue;
          }

          console.warn('Session verification failed:', verifyError);
          markSessionRestoreUnavailable(verifyError.message || 'Session verification failed.');
          return null;
        }
      }

      console.warn('Session verification failed: backend still unavailable.');
      markSessionRestoreUnavailable(SESSION_RESTORE_UNAVAILABLE_MESSAGE);
      return null;
    })();

    const trackedPromise = restorePromise.finally(() => {
      if (sessionRestorePromiseRef.current === trackedPromise) {
        sessionRestorePromiseRef.current = null;
      }
    });

    sessionRestorePromiseRef.current = trackedPromise;
    return trackedPromise;
  }, [
    clearSessionRestoreState,
    markSessionMissing,
    markSessionRestoreUnavailable,
    scheduleRuntimeBootstrap
  ]);

  const retrySessionRestore = useCallback(async () => {
    return performSessionRestore();
  }, [performSessionRestore]);

  useEffect(() => {
    void performSessionRestore();
  }, [performSessionRestore]);

  useEffect(() => runtimeCoordinator.subscribe((event) => {
    if (!event?.type) {
      return;
    }

    if (event.type === 'auth:login') {
      void performSessionRestore();
      return;
    }

    if (event.type === 'auth:logout') {
      socketService.disconnect();
      clearLoadedCryptoIdentity();
      clearSessionRestoreState();
      resetRuntimeState();
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return;
    }

    if (event.type === 'profile:update' && event.payload?.user) {
      dispatch({
        type: AUTH_ACTIONS.UPDATE_PROFILE,
        payload: event.payload.user
      });
    }
  }), [
    clearSessionRestoreState,
    performSessionRestore,
    resetRuntimeState
  ]);

  const login = async (credentials) => {
    clearSessionRestoreState();
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });

    try {
      const response = await apiService.login(credentials);
      if (response?.requires2FA) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return response;
      }

      const nextUser = normalizeAuthUser(response.user);
      clearSessionRestoreState();
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: { user: nextUser }
      });
      if (userRequiresPasskeyEnrollment(nextUser)) {
        resetRuntimeState();
      } else {
        runtimeCoordinator.publish('auth:login', {
          userId: nextUser?.id || nextUser?._id || null
        });
        scheduleRuntimeBootstrap(nextUser, { reason: 'login' });
      }
      return response;
    } catch (error) {
      socketService.disconnect();
      clearLoadedCryptoIdentity();
      resetRuntimeState();
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: error.message
      });
      throw error;
    }
  };

  const register = async (userData) => {
    clearSessionRestoreState();
    dispatch({ type: AUTH_ACTIONS.REGISTER_START });

    try {
      const response = await apiService.register(userData);
      const nextUser = normalizeAuthUser(response.user);
      clearSessionRestoreState();
      dispatch({
        type: AUTH_ACTIONS.REGISTER_SUCCESS,
        payload: { user: nextUser }
      });
      if (userRequiresPasskeyEnrollment(nextUser)) {
        resetRuntimeState();
      } else {
        runtimeCoordinator.publish('auth:login', {
          userId: nextUser?.id || nextUser?._id || null
        });
        scheduleRuntimeBootstrap(nextUser, { reason: 'register' });
      }
      return response;
    } catch (error) {
      socketService.disconnect();
      clearLoadedCryptoIdentity();
      resetRuntimeState();
      dispatch({
        type: AUTH_ACTIONS.REGISTER_FAILURE,
        payload: error.message
      });
      throw error;
    }
  };

  const loginWithPasskey = async (identifier = '') => {
    clearSessionRestoreState();
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });

    try {
      const response = await passkeyService.authenticate(identifier);
      if (response?.requires2FA) {
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        return response;
      }

      const nextUser = normalizeAuthUser(response.user);
      clearSessionRestoreState();
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: { user: nextUser }
      });
      if (userRequiresPasskeyEnrollment(nextUser)) {
        resetRuntimeState();
      } else {
        runtimeCoordinator.publish('auth:login', {
          userId: nextUser?.id || nextUser?._id || null
        });
        scheduleRuntimeBootstrap(nextUser, { reason: 'passkey-login' });
      }
      return response;
    } catch (error) {
      socketService.disconnect();
      clearLoadedCryptoIdentity();
      resetRuntimeState();
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: error.message
      });
      throw error;
    }
  };

  const verifyTwoFactorLogin = async ({ partialToken, token }) => {
    clearSessionRestoreState();
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });

    try {
      const response = await apiService.verifyTwoFactorLogin({ partialToken, token });
      const nextUser = normalizeAuthUser(response.user);
      clearSessionRestoreState();
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: { user: nextUser }
      });
      if (userRequiresPasskeyEnrollment(nextUser)) {
        resetRuntimeState();
      } else {
        runtimeCoordinator.publish('auth:login', {
          userId: nextUser?.id || nextUser?._id || null
        });
        scheduleRuntimeBootstrap(nextUser, { reason: '2fa-login' });
      }
      return response;
    } catch (error) {
      socketService.disconnect();
      clearLoadedCryptoIdentity();
      resetRuntimeState();
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: error.message
      });
      throw error;
    }
  };

  const refreshPasskeyEnrollment = async () => {
    const response = await apiService.verifyToken();
    const nextUser = normalizeAuthUser(response.user);

    dispatch({
      type: AUTH_ACTIONS.LOGIN_SUCCESS,
      payload: { user: nextUser }
    });

    if (!userRequiresPasskeyEnrollment(nextUser)) {
      runtimeCoordinator.publish('auth:login', {
        userId: nextUser?.id || nextUser?._id || null
      });
      scheduleRuntimeBootstrap(nextUser, { reason: 'passkey-enrolled' });
    }

    return nextUser;
  };

  const logout = async () => {
    const activeUserId = currentUserRef.current?._id || currentUserRef.current?.id || null;

    try {
      await clearServerPushSubscription();
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      clearSessionRestoreState();
      socketService.disconnect();
      clearLoadedCryptoIdentity();
      resetRuntimeState();
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      runtimeCoordinator.publish('auth:logout', {
        userId: activeUserId
      });
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await apiService.updateProfile(profileData);
      const nextUser = normalizeAuthUser(response.user);
      dispatch({
        type: AUTH_ACTIONS.UPDATE_PROFILE,
        payload: nextUser
      });
      runtimeCoordinator.publish('profile:update', {
        user: nextUser
      });
      return response;
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  };

  const changePassword = async (passwordData) => {
    try {
      return await apiService.changePassword(passwordData);
    } catch (error) {
      console.error('Password change error:', error);
      throw error;
    }
  };

  const clearError = useCallback(() => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  }, []);

  const refreshEncryptionState = async () => {
    if (!state.user) {
      const signedOutState = buildSignedOutEncryptionState();
      setEncryptionState(signedOutState);
      return signedOutState;
    }

    const nextEncryptionState = await syncEncryptionState(state.user);
    await registerAndLoadCurrentDevice(nextEncryptionState);
    return nextEncryptionState;
  };

  const retryBootstrap = useCallback(async () => {
    if (!currentUserRef.current) {
      return null;
    }

    return runRuntimeBootstrap(currentUserRef.current, { reason: 'manual-retry' });
  }, [runRuntimeBootstrap]);

  const openDeviceEncryptionResetPrompt = useCallback(() => {
    if (encryptionState?.status !== 'key_mismatch') {
      return;
    }

    setDeviceResetError('');
    setIsDeviceResetPromptOpen(true);
  }, [encryptionState?.status]);

  const closeDeviceEncryptionResetPrompt = useCallback(() => {
    if (isResettingDeviceEncryption) {
      return;
    }

    setIsDeviceResetPromptOpen(false);
    setDeviceResetError('');
  }, [isResettingDeviceEncryption]);

  const resetCurrentDeviceEncryption = useCallback(async () => {
    const currentUser = currentUserRef.current;

    if (!currentUser) {
      throw new Error('Sign in again before resetting device encryption.');
    }

    setIsResettingDeviceEncryption(true);
    setDeviceResetError('');

    try {
      const cryptoService = await loadCryptoService();
      const resetState = await cryptoService.resetCurrentDeviceIdentity(currentUser);
      setEncryptionState(resetState);
      const bootstrapResult = await runRuntimeBootstrap(currentUser, { reason: 'device-reset' });
      setIsDeviceResetPromptOpen(false);
      setDeviceResetError('');
      return bootstrapResult || { encryptionState: resetState, issue: null };
    } catch (error) {
      const resetIssue = classifyBootstrapError(error, 'encryption');
      setDeviceResetError(resetIssue.message);
      setBootstrapStatus('degraded');
      setBootstrapIssue(resetIssue);
      setBootstrapError(resetIssue.message);
      throw error;
    } finally {
      setIsResettingDeviceEncryption(false);
    }
  }, [runRuntimeBootstrap]);

  const downloadEncryptionBackup = async (passphrase) => {
    const cryptoService = await loadCryptoService();
    const backup = await cryptoService.downloadIdentityBackup(
      passphrase,
      state.user?._id || state.user?.id
    );

    setEncryptionState((currentState) => ({
      ...currentState,
      lastBackupAt: new Date().toISOString()
    }));

    return backup;
  };

  const restoreEncryptionBackup = async (serializedBackup, passphrase) => {
    const cryptoService = await loadCryptoService();
    const restoredState = await cryptoService.importIdentityBackup(
      serializedBackup,
      passphrase,
      state.user?._id || state.user?.id
    );

    setEncryptionState(restoredState);
    await registerAndLoadCurrentDevice(restoredState);
    return restoredState;
  };

  const refreshDevices = async () => {
    if (!state.isAuthenticated) {
      setDevices([]);
      return [];
    }

    const response = await apiService.getDevices();
    setDevices(response.devices || []);
    setCurrentDeviceId(response.currentDeviceId || apiService.getCurrentDeviceId());
    return response.devices || [];
  };

  const renameDevice = async (deviceId, deviceName) => {
    const response = await apiService.updateDevice(deviceId, { deviceName });
    await refreshDevices();
    return response.device;
  };

  const revokeDevice = async (deviceId) => {
    const response = await apiService.revokeDevice(deviceId);
    await refreshDevices();
    return response;
  };

  useEffect(() => {
    const hasCurrentDeviceRegistration = devices.some(
      (device) => device?.deviceId === currentDeviceId && !device?.revokedAt
    );

    if (!state.isAuthenticated || !hasCurrentDeviceRegistration) {
      return undefined;
    }

    const heartbeat = async () => {
      try {
        await apiService.updateCurrentDeviceActivity();
      } catch (error) {
        console.warn('Device heartbeat failed:', error);
      }
    };

    heartbeat();

    const intervalId = window.setInterval(heartbeat, 60000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        heartbeat();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [currentDeviceId, devices, state.isAuthenticated]);

  const runtimeDiagnostics = useMemo(() => ({
    bootstrapStatus,
    bootstrapIssue,
    bootstrapError,
    sessionRestoreStatus,
    sessionRestoreMessage,
    realtimeStatus,
    realtimeError,
    isReady: bootstrapStatus === 'ready',
    isDegraded: bootstrapStatus === 'degraded',
    isRecoveringBackend: sessionRestoreStatus === 'recovering'
  }), [
    bootstrapError,
    bootstrapIssue,
    bootstrapStatus,
    sessionRestoreMessage,
    sessionRestoreStatus,
    realtimeError,
    realtimeStatus
  ]);

  const value = {
    ...state,
    requiresPasskeyEnrollment: state.isAuthenticated && userRequiresPasskeyEnrollment(state.user),
    encryptionState,
    devices,
    currentDeviceId,
    bootstrapStatus,
    bootstrapIssue,
    bootstrapError,
    sessionRestoreStatus,
    sessionRestoreMessage,
    realtimeStatus,
    realtimeError,
    runtimeDiagnostics,
    login,
    loginWithPasskey,
    verifyTwoFactorLogin,
    register,
    logout,
    updateProfile,
    changePassword,
    refreshPasskeyEnrollment,
    clearError,
    refreshEncryptionState,
    retryBootstrap,
    retrySessionRestore,
    downloadEncryptionBackup,
    restoreEncryptionBackup,
    refreshDevices,
    renameDevice,
    revokeDevice,
    isDeviceResetPromptOpen,
    isResettingDeviceEncryption,
    deviceResetError,
    openDeviceEncryptionResetPrompt,
    closeDeviceEncryptionResetPrompt,
    resetCurrentDeviceEncryption
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
