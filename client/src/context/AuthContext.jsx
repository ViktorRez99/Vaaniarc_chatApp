import React, { createContext, useContext, useReducer, useEffect, useState } from 'react';
import apiService from '../services/api';
import socketService from '../services/socket';
import cryptoService from '../services/cryptoService';
import {
  clearServerPushSubscription,
  syncPushSubscription
} from '../services/notifications';

// Initial state
const initialState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
};

// Action types
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
  SET_LOADING: 'SET_LOADING',
};

// Reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
    case AUTH_ACTIONS.REGISTER_START:
      return {
        ...state,
        isLoading: true,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_SUCCESS:
    case AUTH_ACTIONS.REGISTER_SUCCESS:
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
      };

    case AUTH_ACTIONS.LOGIN_FAILURE:
    case AUTH_ACTIONS.REGISTER_FAILURE:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: action.payload,
      };

    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      };

    case AUTH_ACTIONS.UPDATE_PROFILE:
      return {
        ...state,
        user: { ...state.user, ...action.payload },
      };

    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null,
      };

    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        isLoading: action.payload,
      };

    default:
      return state;
  }
};

// Create context
const AuthContext = createContext();

// AuthProvider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const [devices, setDevices] = useState([]);
  const [currentDeviceId, setCurrentDeviceId] = useState(apiService.getCurrentDeviceId());
  const [encryptionState, setEncryptionState] = useState({
    status: 'loading',
    message: 'Checking encryption status...'
  });

  const syncEncryptionState = async (nextUser) => {
    const resolvedState = await cryptoService.ensureIdentity(nextUser);
    setEncryptionState(resolvedState);
    return resolvedState;
  };

  const syncCurrentDevice = async (identityState) => {
    try {
      await apiService.registerCurrentDevice(identityState);
      const response = await apiService.getDevices();
      setDevices(response.devices || []);
      setCurrentDeviceId(response.currentDeviceId || apiService.getCurrentDeviceId());
      return response.devices || [];
    } catch (error) {
      console.error('Device sync failed:', error);
      return [];
    }
  };

  const syncExistingPushSubscription = async () => {
    try {
      await syncPushSubscription({ requestPermission: false });
    } catch (error) {
      console.error('Push subscription sync failed:', error);
    }
  };

  // Check if user is already logged in on app start
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await apiService.verifyToken();
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { user: response.user },
        });
        const nextEncryptionState = await syncEncryptionState(response.user);
        await syncCurrentDevice(nextEncryptionState);
        await syncExistingPushSubscription();
        socketService.connect();
      } catch (error) {
        if (!/session required|access token or session required/i.test(String(error?.message || ''))) {
          console.error('Session verification failed:', error);
        }
        setDevices([]);
        setEncryptionState({
          status: 'signed_out',
          message: 'Sign in to enable end-to-end encryption.'
        });
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };

    checkAuth();
  }, []);

  // Login function
  const login = async (credentials) => {
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });
    
    try {
      const response = await apiService.login(credentials);
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: { user: response.user },
      });
      const nextEncryptionState = await syncEncryptionState(response.user);
      await syncCurrentDevice(nextEncryptionState);
      await syncExistingPushSubscription();
      socketService.connect();
      return response;
    } catch (error) {
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: error.message,
      });
      throw error;
    }
  };

  // Register function
  const register = async (userData) => {
    dispatch({ type: AUTH_ACTIONS.REGISTER_START });
    
    try {
      const response = await apiService.register(userData);
      dispatch({
        type: AUTH_ACTIONS.REGISTER_SUCCESS,
        payload: { user: response.user },
      });
      const nextEncryptionState = await syncEncryptionState(response.user);
      await syncCurrentDevice(nextEncryptionState);
      await syncExistingPushSubscription();
      socketService.connect();
      return response;
    } catch (error) {
      dispatch({
        type: AUTH_ACTIONS.REGISTER_FAILURE,
        payload: error.message,
      });
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
    try {
      await clearServerPushSubscription();
      await apiService.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Disconnect socket
      socketService.disconnect();
      cryptoService.clearActiveIdentity();
      setDevices([]);
      setCurrentDeviceId(apiService.getCurrentDeviceId());
      setEncryptionState({
        status: 'signed_out',
        message: 'Sign in to enable end-to-end encryption.'
      });
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    }
  };

  // Update profile function
  const updateProfile = async (profileData) => {
    try {
      const response = await apiService.updateProfile(profileData);
      dispatch({
        type: AUTH_ACTIONS.UPDATE_PROFILE,
        payload: response.user,
      });
      return response;
    } catch (error) {
      console.error('Profile update error:', error);
      throw error;
    }
  };

  // Change password function
  const changePassword = async (passwordData) => {
    try {
      return await apiService.changePassword(passwordData);
    } catch (error) {
      console.error('Password change error:', error);
      throw error;
    }
  };

  // Clear error function
  const clearError = () => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  };

  const refreshEncryptionState = async () => {
    if (!state.user) {
      const signedOutState = {
        status: 'signed_out',
        message: 'Sign in to enable end-to-end encryption.'
      };
      setEncryptionState(signedOutState);
      return signedOutState;
    }

    const nextEncryptionState = await syncEncryptionState(state.user);
    await syncCurrentDevice(nextEncryptionState);
    return nextEncryptionState;
  };

  const downloadEncryptionBackup = async (passphrase) => {
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
    const restoredState = await cryptoService.importIdentityBackup(
      serializedBackup,
      passphrase,
      state.user?._id || state.user?.id
    );

    setEncryptionState(restoredState);
    await syncCurrentDevice(restoredState);
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
    if (!state.isAuthenticated) {
      return undefined;
    }

    const heartbeat = async () => {
      try {
        await apiService.updateCurrentDeviceActivity();
      } catch (error) {
        console.error('Device heartbeat failed:', error);
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
  }, [state.isAuthenticated]);

  // Context value
  const value = {
    ...state,
    encryptionState,
    devices,
    currentDeviceId,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    clearError,
    refreshEncryptionState,
    downloadEncryptionBackup,
    restoreEncryptionBackup,
    refreshDevices,
    renameDevice,
    revokeDevice,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
