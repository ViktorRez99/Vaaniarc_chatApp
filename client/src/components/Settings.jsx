import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasskeysPanel from './PasskeysPanel';
import RecoveryKitPanel from './RecoveryKitPanel';
import RuntimeStatusBanner from './RuntimeStatusBanner';
import apiService from '../services/api';
import {
  disablePushNotifications,
  getPushStatus,
  syncPushSubscription
} from '../services/notifications';
import { PASSWORD_POLICY, validatePassword } from '../utils/passwordPolicy';

const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function Settings() {
  const navigate = useNavigate();
  const {
    user,
    updateProfile,
    changePassword,
    logout,
    encryptionState,
    devices,
    currentDeviceId,
    refreshEncryptionState,
    downloadEncryptionBackup,
    restoreEncryptionBackup,
    refreshDevices,
    renameDevice,
    revokeDevice,
    openDeviceEncryptionResetPrompt
  } = useAuth();
  const [activeSection, setActiveSection] = useState("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [showAvatarModal, setShowAvatarModal] = useState(false);

  // Separate state for original data and form data
  const [savedData, setSavedData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    bio: '',
    phone: '',
    location: ''
  });

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    bio: '',
    phone: '',
    location: ''
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [notifications, setNotifications] = useState({
    push: true
  });
  const [pushStatus, setPushStatus] = useState({
    supported: false,
    enabled: false,
    permission: 'default',
    serverConfigured: false
  });
  const [pushToggleLoading, setPushToggleLoading] = useState(false);
  const [theme, setTheme] = useState('system');
  const [fontType, setFontType] = useState('inter');
  const [fontSize, setFontSize] = useState(16);
  const fileInputRef = useRef(null);
  const backupFileInputRef = useRef(null);
  const timeoutRefs = useRef(new Set());

  const scheduleTimeout = useCallback((callback, delay) => {
    const timeoutId = window.setTimeout(() => {
      timeoutRefs.current.delete(timeoutId);
      callback();
    }, delay);
    timeoutRefs.current.add(timeoutId);
    return timeoutId;
  }, []);

  useEffect(() => () => {
    timeoutRefs.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
    timeoutRefs.current.clear();
  }, []);

  // Privacy & Security States
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorStatusLoading, setTwoFactorStatusLoading] = useState(false);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorModalMode, setTwoFactorModalMode] = useState(null);
  const [twoFactorSetup, setTwoFactorSetup] = useState(null);
  const [twoFactorBackupCodes, setTwoFactorBackupCodes] = useState([]);
  const [twoFactorForm, setTwoFactorForm] = useState({
    token: '',
    password: ''
  });
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showSessionsExpanded, setShowSessionsExpanded] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [authSessions, setAuthSessions] = useState([]);
  const [authSessionsLoading, setAuthSessionsLoading] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState('');
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Cartoonish avatar options
  const avatarOptions = [
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Luna',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Max',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Bella',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Mia',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Leo',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Zoe',
    'https://api.dicebear.com/7.x/avataaars/svg?seed=Jack'
  ];

  const resetTwoFactorFlow = useCallback(() => {
    setTwoFactorModalMode(null);
    setTwoFactorSetup(null);
    setTwoFactorBackupCodes([]);
    setTwoFactorForm({
      token: '',
      password: ''
    });
  }, []);

  const closeTwoFactorModal = useCallback(() => {
    resetTwoFactorFlow();
    setError('');
  }, [resetTwoFactorFlow]);

  // Initialize data from user context
  useEffect(() => {
    if (user) {
      const userData = {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        username: user.username || '',
        email: user.email || '',
        bio: user.bio || '',
        phone: user.phone || '',
        location: user.location || ''
      };
      setSavedData(userData);
      setFormData(userData);
      if (user.avatar) {
        setAvatarUrl(user.avatar);
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    const loadDevices = async () => {
      try {
        setSessionsLoading(true);
        await refreshDevices();
      } catch (loadError) {
        setError(loadError.message || 'Failed to load linked devices.');
      } finally {
        setSessionsLoading(false);
      }
    };

    void loadDevices();
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setAuthSessions([]);
      return undefined;
    }

    const loadAuthSessions = async () => {
      try {
        setAuthSessionsLoading(true);
        const response = await apiService.getAuthSessions();
        if (!cancelled) {
          setAuthSessions(Array.isArray(response.sessions) ? response.sessions : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Failed to load active login sessions.');
        }
      } finally {
        if (!cancelled) {
          setAuthSessionsLoading(false);
        }
      }
    };

    loadAuthSessions();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadPushStatus = async () => {
      try {
        const status = await getPushStatus();
        if (cancelled) {
          return;
        }

        setPushStatus(status);
        setNotifications((currentValue) => ({
          ...currentValue,
          push: Boolean(status.enabled)
        }));
      } catch (loadError) {
        if (!cancelled) {
          console.error('Failed to load push notification status:', loadError);
        }
      }
    };

    loadPushStatus();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setTwoFactorEnabled(false);
      setTwoFactorStatusLoading(false);
      resetTwoFactorFlow();
      return undefined;
    }

    const loadTwoFactorStatus = async () => {
      try {
        setTwoFactorStatusLoading(true);
        const status = await apiService.getTwoFactorStatus();
        if (!cancelled) {
          setTwoFactorEnabled(Boolean(status.enabled));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || 'Failed to load 2FA status.');
        }
      } finally {
        if (!cancelled) {
          setTwoFactorStatusLoading(false);
        }
      }
    };

    loadTwoFactorStatus();

    return () => {
      cancelled = true;
    };
  }, [resetTwoFactorFlow, user]);

  const getFontFamily = () => {
    switch(fontType) {
      case 'roboto':
        return 'Roboto, system-ui, sans-serif';
      case 'poppins':
        return 'Poppins, system-ui, sans-serif';
      case 'inter':
      default:
        return 'Inter, system-ui, sans-serif';
    }
  };

  const getInitials = (firstName, lastName) => {
    if (firstName && lastName) {
      return (firstName[0] + lastName[0]).toUpperCase();
    }
    if (user && user.username) {
      return user.username.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  const formatLastActive = (value) => {
    if (!value) {
      return 'Recently';
    }

    const timestamp = new Date(value).getTime();
    if (Number.isNaN(timestamp)) {
      return 'Recently';
    }

    const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));

    if (seconds < 60) {
      return 'Just now';
    }

    if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    }

    if (seconds < 86400) {
      const hours = Math.floor(seconds / 3600);
      return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    }

    const days = Math.floor(seconds / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const activeSessions = devices.map((device) => ({
    id: device.deviceId,
    device: device.deviceName || `${device.browser || 'Browser'} on ${device.platform || 'Unknown Device'}`,
    location: device.lastIp || 'Current network',
    lastActive: formatLastActive(device.lastActive),
    rawLastActive: device.lastActive,
    current: device.deviceId === currentDeviceId || device.isCurrent,
    fingerprint: device.publicKeyFingerprint,
    identityStatus: device.identityStatus,
    revoked: Boolean(device.revokedAt)
  }));

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (file) {
      try {
        // In a real app, we would upload this to the server
        // For now, we'll just use the local preview
        // const response = await apiService.uploadAvatar(file);
        // setAvatarUrl(response.url);
        
        const reader = new FileReader();
        reader.onloadend = () => {
          setAvatarUrl(reader.result);
          setShowAvatarModal(false);
          setSuccess('Avatar uploaded successfully!');
          scheduleTimeout(() => setSuccess(''), 3000);
        };
        reader.readAsDataURL(file);
      } catch (uploadError) {
        console.error('Failed to upload avatar preview:', uploadError);
        setError('Failed to upload avatar');
        scheduleTimeout(() => setError(''), 3000);
      }
    }
  };

  const handleSelectAvatar = (url) => {
    setAvatarUrl(url);
    setShowAvatarModal(false);
    setSuccess('Avatar selected successfully!');
    scheduleTimeout(() => setSuccess(''), 3000);
  };

  const handleRemoveAvatar = () => {
    setAvatarUrl('');
    setShowAvatarModal(false);
    setSuccess('Avatar removed successfully!');
    scheduleTimeout(() => setSuccess(''), 3000);
  };

  const handleSaveProfile = async () => {
    // Basic validation
    if (!formData.username.trim()) {
      setError('Username is required!');
      return;
    }

    const trimmedEmail = formData.email.trim();

    if (!trimmedEmail) {
      setError('Email is required!');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      setError('Please enter a valid email address!');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      await updateProfile({
        ...formData,
        email: trimmedEmail,
        avatar: avatarUrl // Include avatar if it was changed
      });

      setSavedData({
        ...formData,
        email: trimmedEmail
      });
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
    } catch (err) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setFormData({...savedData});
    setIsEditing(false);
    setError('');
  };

  const handleEditClick = () => {
    setFormData({...savedData});
    setIsEditing(true);
  };

  const handleSignOut = async () => {
    try {
      await logout();
      navigate('/');
    } catch (err) {
      setError(err.message || 'Logout failed.');
    }
  };

  const toggleNotification = async () => {
    setPushToggleLoading(true);
    setError('');
    setSuccess('');

    try {
      const nextStatus = notifications.push
        ? await disablePushNotifications()
        : await syncPushSubscription({ requestPermission: true });

      const resolvedStatus = nextStatus?.supported === false
        ? nextStatus
        : {
            ...(await getPushStatus()),
            ...nextStatus
          };

      setPushStatus(resolvedStatus);
      setNotifications((prev) => ({
        ...prev,
        push: Boolean(resolvedStatus.enabled)
      }));

      if (!resolvedStatus.supported) {
        setError('This browser does not support push notifications.');
      } else if (!resolvedStatus.serverConfigured) {
        setError('Push notifications are not configured on the server yet.');
      } else if (!resolvedStatus.enabled && resolvedStatus.permission === 'denied') {
        setError('Browser notifications are blocked for this site.');
      } else {
        setSuccess(resolvedStatus.enabled ? 'Push notifications enabled.' : 'Push notifications disabled.');
        scheduleTimeout(() => setSuccess(''), 3000);
      }
    } catch (toggleError) {
      setError(toggleError.message || 'Failed to update push notifications.');
    } finally {
      setPushToggleLoading(false);
    }
  };

  const handleToggle2FA = async () => {
    if (twoFactorBusy || twoFactorStatusLoading) {
      return;
    }

    setError('');
    setSuccess('');

    if (twoFactorEnabled) {
      setTwoFactorBackupCodes([]);
      setTwoFactorSetup(null);
      setTwoFactorForm({
        token: '',
        password: ''
      });
      setTwoFactorModalMode('disable');
      return;
    }

    try {
      setTwoFactorBusy(true);
      const setup = await apiService.setupTwoFactor();
      setTwoFactorSetup(setup);
      setTwoFactorBackupCodes([]);
      setTwoFactorForm({
        token: '',
        password: ''
      });
      setTwoFactorModalMode('setup');
    } catch (twoFactorError) {
      setError(twoFactorError.message || 'Failed to start Two-Factor Authentication setup.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleEnableTwoFactor = async () => {
    if (twoFactorBackupCodes.length > 0) {
      closeTwoFactorModal();
      setSuccess('Two-Factor Authentication is now active.');
      scheduleTimeout(() => setSuccess(''), 3000);
      return;
    }

    const token = twoFactorForm.token.trim();
    if (!token) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }

    try {
      setTwoFactorBusy(true);
      const result = await apiService.enableTwoFactor({ token });
      setTwoFactorEnabled(true);
      setTwoFactorBackupCodes(Array.isArray(result.backupCodes) ? result.backupCodes : []);
      setSuccess('Two-Factor Authentication enabled.');
    } catch (twoFactorError) {
      setError(twoFactorError.message || 'Failed to enable Two-Factor Authentication.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleDisableTwoFactor = async () => {
    const token = twoFactorForm.token.trim();
    const password = twoFactorForm.password;

    if (!password || !token) {
      setError('Password and verification code are required to disable 2FA.');
      return;
    }

    try {
      setTwoFactorBusy(true);
      await apiService.disableTwoFactor({
        password,
        token
      });
      setTwoFactorEnabled(false);
      closeTwoFactorModal();
      setSuccess('Two-Factor Authentication disabled.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (twoFactorError) {
      setError(twoFactorError.message || 'Failed to disable Two-Factor Authentication.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleCopyBackupCodes = async () => {
    if (twoFactorBackupCodes.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(twoFactorBackupCodes.join('\n'));
      setSuccess('Backup codes copied.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (copyError) {
      setError(copyError.message || 'Failed to copy backup codes.');
    }
  };

  const handleChangePassword = async () => {
    if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
      setError('All password fields are required!');
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('New passwords do not match!');
      return;
    }
    const passwordValidation = validatePassword(passwordData.newPassword);
    if (!passwordValidation.isValid) {
      setError(passwordValidation.error);
      return;
    }

    try {
      await changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      
      setSuccess('Password changed successfully!');
      setShowPasswordModal(false);
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to change password');
    }
  };

  const handleRenameSession = async (sessionId, currentName) => {
    const nextName = window.prompt('Enter a label for this linked device.', currentName);

    if (nextName === null) {
      return;
    }

    const trimmedName = nextName.trim();
    if (!trimmedName) {
      setError('Device name cannot be empty.');
      return;
    }

    try {
      await renameDevice(sessionId, trimmedName);
      setSuccess('Device name updated.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (renameError) {
      setError(renameError.message || 'Failed to rename device.');
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await revokeDevice(sessionId);
      setSuccess('Linked device revoked successfully.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (revokeError) {
      setError(revokeError.message || 'Failed to revoke linked device.');
    }
  };

  const refreshAuthSessions = async () => {
    setAuthSessionsLoading(true);
    try {
      const response = await apiService.getAuthSessions();
      setAuthSessions(Array.isArray(response.sessions) ? response.sessions : []);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load active login sessions.');
    } finally {
      setAuthSessionsLoading(false);
    }
  };

  const handleRevokeAuthSession = async (sessionId) => {
    if (!window.confirm('Revoke this login session? That browser or device will need to sign in again.')) {
      return;
    }

    setAccountActionLoading(`session:${sessionId}`);
    setError('');
    setSuccess('');

    try {
      await apiService.revokeAuthSession(sessionId);
      await refreshAuthSessions();
      setSuccess('Login session revoked.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (revokeError) {
      setError(revokeError.message || 'Failed to revoke login session.');
    } finally {
      setAccountActionLoading('');
    }
  };

  const handleDownloadAccountExport = async () => {
    setAccountActionLoading('export');
    setError('');
    setSuccess('');

    try {
      const exportData = await apiService.exportAccountData();
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `vaaniarc-account-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setSuccess('Account data export prepared.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (exportError) {
      setError(exportError.message || 'Failed to export account data.');
    } finally {
      setAccountActionLoading('');
    }
  };

  const handleDeleteAccount = async () => {
    if (!window.confirm('Delete your VaaniArc account permanently? This cannot be undone.')) {
      return;
    }

    const password = window.prompt('Enter your password to permanently delete this account.');
    if (password === null) {
      return;
    }

    setAccountActionLoading('delete');
    setError('');
    setSuccess('');

    try {
      await apiService.deleteAccount(password);
      await logout();
      navigate('/auth', { replace: true });
    } catch (deleteError) {
      setError(deleteError.message || 'Failed to delete account.');
    } finally {
      setAccountActionLoading('');
    }
  };

  const handleCopyFingerprint = async () => {
    if (!encryptionState?.fingerprint) {
      setError('No active device fingerprint is available yet.');
      return;
    }

    try {
      await navigator.clipboard.writeText(encryptionState.fingerprint);
      setSuccess('Device fingerprint copied.');
      scheduleTimeout(() => setSuccess(''), 3000);
    } catch (copyError) {
      console.error('Failed to copy device fingerprint:', copyError);
      setError('Failed to copy the device fingerprint.');
    }
  };

  const handleExportEncryptionBackup = async () => {
    const passphrase = window.prompt('Enter a backup passphrase with at least 8 characters.');

    if (passphrase === null) {
      return;
    }

    try {
      await downloadEncryptionBackup(passphrase);
      setSuccess('Encrypted key backup downloaded. Keep the file and passphrase safe.');
      scheduleTimeout(() => setSuccess(''), 4000);
    } catch (backupError) {
      setError(backupError.message || 'Failed to export the encryption backup.');
    }
  };

  const handleImportEncryptionBackup = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const passphrase = window.prompt('Enter the passphrase for this encryption backup.');

    if (passphrase === null) {
      return;
    }

    try {
      const backupContent = await file.text();
      await restoreEncryptionBackup(backupContent, passphrase);
      setSuccess('Encryption backup restored on this device.');
      scheduleTimeout(() => setSuccess(''), 4000);
    } catch (restoreError) {
      setError(restoreError.message || 'Failed to restore the encryption backup.');
    }
  };

  const renderProfileSection = () => (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse">
          <p className="text-red-400 text-sm font-bold">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 backdrop-blur-xl border border-green-500/20 rounded-2xl p-4 flex items-center justify-between animate-pulse">
          <p className="text-green-400 text-sm font-bold">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-slate-900/10 backdrop-blur-[40px] rounded-3xl p-8 border border-white/10 shadow-2xl">
        <div className="flex items-center gap-6 mb-8">
          <div className="relative group">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-24 h-24 rounded-3xl object-cover shadow-2xl ring-4 ring-white/5" />
            ) : (
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-violet-600/20 border border-white/10 flex items-center justify-center text-white font-bold text-3xl shadow-2xl backdrop-blur-xl">
                {getInitials(savedData.firstName, savedData.lastName)}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-4 border-slate-900 bg-emerald-400 shadow-lg"></div>
            <button 
              onClick={() => setShowAvatarModal(true)}
              className="absolute -top-2 -right-2 w-9 h-9 rounded-full bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center text-white shadow-lg transition-all hover:scale-110 hover:rotate-12"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
          <div className="flex-1">
            <h2 className="text-3xl font-bold text-white tracking-tight">
              {savedData.firstName || savedData.lastName ? `${savedData.firstName} ${savedData.lastName}` : savedData.username}
            </h2>
            <p className="text-base font-medium text-indigo-300">@{savedData.username}</p>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.6)]"></span>
              <span className="text-xs text-emerald-400 font-bold tracking-wide uppercase">Active now</span>
            </div>
          </div>
        </div>

        {isEditing ? (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                  First Name
                </label>
                <input
                  type="text"
                  value={formData.firstName}
                  onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                  className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                  placeholder="Enter first name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                  Last Name
                </label>
                <input
                  type="text"
                  value={formData.lastName}
                  onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                  className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                  placeholder="Enter last name"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                Username <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-5 top-1/2 transform -translate-y-1/2 text-slate-500 font-bold">@</span>
                <input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({...formData, username: e.target.value.toLowerCase().replace(/\s/g, '')})}
                  className="w-full pl-10 pr-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                  placeholder="username"
                />
              </div>
              <p className="text-xs text-slate-500 font-medium ml-1">Username must be unique and contain no spaces</p>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
                Email <span className="text-rose-400">*</span>
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                required
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                placeholder="name@example.com"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Phone Number</label>
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({...formData, phone: e.target.value})}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                placeholder="+1 234 567 8900"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({...formData, location: e.target.value})}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                placeholder="City, Country"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Bio</label>
              <textarea
                value={formData.bio}
                onChange={(e) => setFormData({...formData, bio: e.target.value})}
                rows={4}
                maxLength={200}
                className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all backdrop-blur-sm"
                placeholder="Tell us about yourself..."
              />
              <p className="text-xs text-slate-500 font-medium text-right">{formData.bio.length}/200 characters</p>
            </div>
            <div className="flex gap-4 pt-4">
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={handleCancelEdit}
                className="px-8 py-4 bg-white/5 hover:bg-white/10 text-white rounded-2xl transition-all font-bold border border-white/10 hover:border-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 animate-fadeIn">
            <div className="bg-white/5 rounded-2xl border border-white/10 p-5 backdrop-blur-sm">
              <div className="grid grid-cols-2 gap-6 mb-6">
                <div className="group">
                  <div className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider group-hover:text-indigo-300 transition-colors">Email</div>
                  <div className="text-sm text-white font-medium">{savedData.email || 'Not set'}</div>
                </div>
                <div className="group">
                  <div className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider group-hover:text-indigo-300 transition-colors">Phone</div>
                  <div className="text-sm text-white font-medium">{savedData.phone || 'Not set'}</div>
                </div>
                <div className="group">
                  <div className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider group-hover:text-indigo-300 transition-colors">Location</div>
                  <div className="text-sm text-white font-medium">{savedData.location || 'Not set'}</div>
                </div>
                <div className="group col-span-2">
                  <div className="text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider group-hover:text-indigo-300 transition-colors">Bio</div>
                  <div className="text-sm text-white font-medium leading-relaxed">{savedData.bio || 'No bio added yet'}</div>
                </div>
              </div>
              
              <button 
                onClick={handleEditClick}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/5 hover:bg-indigo-500/20 text-slate-300 hover:text-indigo-300 rounded-xl transition-all duration-300 border border-white/10 hover:border-indigo-500/30 group"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span className="text-sm font-bold">Edit Profile</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderPrivacySection = () => (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/20 rounded-2xl p-4 flex items-center justify-between">
          <p className="text-red-400 text-sm font-bold">{error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {success && (
        <div className="bg-green-500/10 backdrop-blur-xl border border-green-500/20 rounded-2xl p-4 flex items-center justify-between">
          <p className="text-green-400 text-sm font-bold">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="bg-slate-900/10 backdrop-blur-[40px] rounded-3xl p-8 border border-white/10 shadow-2xl">
        <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          Privacy & Security
        </h3>
        <div className="space-y-4">
          <input
            ref={backupFileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImportEncryptionBackup}
            className="hidden"
          />

          <div className={`rounded-2xl border p-6 backdrop-blur-xl transition-all ${
            encryptionState?.status === 'ready'
              ? 'border-emerald-500/20 bg-emerald-500/5'
              : encryptionState?.status === 'needs_recovery' || encryptionState?.status === 'key_mismatch'
                ? 'border-amber-500/20 bg-amber-500/5'
                : 'border-sky-500/20 bg-sky-500/5'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-5">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${
                  encryptionState?.status === 'ready'
                    ? 'bg-emerald-500/10'
                    : encryptionState?.status === 'needs_recovery' || encryptionState?.status === 'key_mismatch'
                      ? 'bg-amber-500/10'
                      : 'bg-sky-500/10'
                }`}>
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-.53.211-1.039.586-1.414A1.996 1.996 0 0114 9c.53 0 1.039.211 1.414.586.375.375.586.884.586 1.414 0 1.433-.667 2.2-2 3m-2 4h.01M5 12a7 7 0 1114 0v5a2 2 0 01-2 2H7a2 2 0 01-2-2v-5z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <div className="text-lg font-bold text-white mb-1">End-to-End Encryption</div>
                  <div className="text-sm text-slate-300 font-medium">
                    {encryptionState?.message || 'Checking encryption status...'}
                  </div>
                  {encryptionState?.fingerprint && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">This Device Fingerprint</div>
                      <div className="mt-1 break-all font-mono text-xs text-emerald-200">{encryptionState.fingerprint}</div>
                    </div>
                  )}
                  {encryptionState?.serverFingerprint && encryptionState.serverFingerprint !== encryptionState.fingerprint && (
                    <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-300/70">Published Account Fingerprint</div>
                      <div className="mt-1 break-all font-mono text-xs text-amber-200">{encryptionState.serverFingerprint}</div>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => refreshEncryptionState()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                Refresh
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleCopyFingerprint}
                disabled={!encryptionState?.fingerprint}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Copy Fingerprint
              </button>
              <button
                type="button"
                onClick={handleExportEncryptionBackup}
                disabled={encryptionState?.status !== 'ready'}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export Key Backup
              </button>
              <button
                type="button"
                onClick={() => backupFileInputRef.current?.click()}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm font-semibold text-amber-100 transition-colors hover:bg-amber-500/20"
              >
                Import Key Backup
              </button>
              {encryptionState?.status === 'key_mismatch' && (
                <button
                  type="button"
                  onClick={openDeviceEncryptionResetPrompt}
                  className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition-colors hover:bg-rose-500/20"
                >
                  Reset This Device
                </button>
              )}
            </div>

            <p className="mt-3 text-xs leading-relaxed text-slate-400">
              Your private key stays on this device. Export a backup before switching browsers or machines, otherwise old encrypted chats cannot be recovered.
            </p>
            {encryptionState?.status === 'key_mismatch' && (
              <p className="mt-2 text-xs leading-relaxed text-amber-200">
                Import a backup first if you still need access to this browser&apos;s old encrypted history. Reset this device only when these local keys are no longer the correct ones for the current device.
              </p>
            )}
          </div>

          <PasskeysPanel />

          <RecoveryKitPanel />

          {/* Two-Factor Authentication Toggle */}
          <div className="flex items-center justify-between p-6 rounded-2xl bg-emerald-500/5 backdrop-blur-xl border border-emerald-500/10 hover:border-emerald-500/30 transition-all group hover:bg-emerald-500/10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold text-white mb-1">Two-Factor Authentication</div>
                <div className="text-sm text-slate-400 font-medium">
                  {twoFactorStatusLoading
                    ? 'Checking authenticator status...'
                    : twoFactorEnabled
                      ? 'Enabled - Authenticator verification is active'
                      : 'Add an authenticator app for stronger sign-in protection'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggle2FA}
              aria-label={twoFactorEnabled ? 'Disable two-factor authentication' : 'Enable two-factor authentication'}
              disabled={twoFactorBusy || twoFactorStatusLoading}
              className={`w-16 h-9 rounded-full relative transition-all duration-300 ${
                twoFactorEnabled ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]' : 'bg-slate-700/50'
              } ${(twoFactorBusy || twoFactorStatusLoading) ? 'cursor-not-allowed opacity-60' : ''}`}
            >
              <div className={`w-7 h-7 rounded-full absolute top-1 transition-all duration-300 shadow-md ${
                twoFactorEnabled ? 'bg-white right-1' : 'bg-slate-400 left-1'
              }`}></div>
            </button>
          </div>

          {/* Change Password */}
          <div className="flex items-center justify-between p-6 rounded-2xl bg-indigo-500/5 backdrop-blur-xl border border-indigo-500/10 hover:border-indigo-500/30 transition-all group hover:bg-indigo-500/10">
            <div className="flex items-center gap-5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <svg className="w-7 h-7 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <div>
                <div className="text-lg font-bold text-white mb-1">Change Password</div>
                <div className="text-sm text-slate-400 font-medium">Update your password regularly for security</div>
              </div>
            </div>
            <button 
              onClick={() => setShowPasswordModal(true)}
              className="px-6 py-3 text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl transition-all shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0"
            >
              Change
            </button>
          </div>

          {/* Linked Devices */}
          <div className="rounded-2xl bg-violet-500/5 backdrop-blur-xl border border-violet-500/10 hover:border-violet-500/30 transition-all overflow-hidden group hover:bg-violet-500/10">
            <button 
              onClick={() => setShowSessionsExpanded(!showSessionsExpanded)}
              className="w-full flex items-center justify-between p-6 transition-all"
            >
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 rounded-2xl bg-violet-500/10 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-7 h-7 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="text-lg font-bold text-white mb-1">Linked Devices</div>
                  <div className="text-sm text-slate-400 font-medium">
                    {sessionsLoading ? 'Loading device activity...' : `${activeSessions.length} linked device${activeSessions.length === 1 ? '' : 's'} available`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-4 py-2 text-xs font-bold bg-violet-500/20 backdrop-blur-sm text-violet-300 rounded-lg border border-violet-500/30">
                  {showSessionsExpanded ? 'Hide Details' : 'Show Details'}
                </span>
                <div className={`p-2 rounded-full bg-white/5 transition-transform duration-300 ${showSessionsExpanded ? 'rotate-180 bg-white/10' : ''}`}>
                  <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </button>

            {/* Expanded Sessions List */}
            <div className={`transition-all duration-500 ease-in-out ${showSessionsExpanded ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
              <div className="px-6 pb-6 space-y-3 border-t border-white/5 pt-4">
                {sessionsLoading && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm font-medium text-slate-400">
                    Loading linked devices...
                  </div>
                )}

                {!sessionsLoading && activeSessions.length === 0 && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm font-medium text-slate-400">
                    No linked devices are registered for this account yet.
                  </div>
                )}

                {!sessionsLoading && activeSessions.map((session) => (
                  <div key={session.id} className="p-4 rounded-xl bg-black/20 backdrop-blur-sm border border-white/5 hover:border-violet-500/30 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-lg bg-violet-500/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
                          <svg className="w-5 h-5 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                            {session.device}
                            {session.current && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-emerald-500/20 text-emerald-400 rounded-full border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                                Current
                              </span>
                            )}
                            {session.revoked && (
                              <span className="px-2 py-0.5 text-[10px] font-bold bg-rose-500/20 text-rose-300 rounded-full border border-rose-500/30">
                                Revoked
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-400 font-medium mt-1 flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {session.location}
                          </div>
                          <div className="text-xs text-slate-500 font-medium mt-0.5 flex items-center gap-1.5">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            Last active: {session.lastActive}
                          </div>
                          {session.fingerprint && (
                            <div className="mt-2 break-all rounded-lg border border-white/5 bg-white/5 px-2.5 py-2 font-mono text-[11px] text-violet-100/80">
                              {session.fingerprint}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <button
                          onClick={() => handleRenameSession(session.id, session.device)}
                          className="px-4 py-2 text-xs font-bold bg-white/5 hover:bg-white/10 text-slate-200 rounded-lg transition-all border border-white/10"
                        >
                          Rename
                        </button>
                        {!session.current && !session.revoked && (
                          <button
                            onClick={() => handleRevokeSession(session.id)}
                            className="px-4 py-2 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg transition-all border border-red-500/20 hover:border-red-500/40"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Account Controls */}
          <div className="rounded-2xl bg-slate-500/5 backdrop-blur-xl border border-white/10 overflow-hidden">
            <div className="p-6 border-b border-white/5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-5">
                  <div className="w-14 h-14 rounded-2xl bg-slate-500/10 backdrop-blur-sm flex items-center justify-center">
                    <svg className="w-7 h-7 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 1.657-2.239 3-5 3S2 12.657 2 11s2.239-3 5-3 5 1.343 5 3zm0 0c0 1.657 2.239 3 5 3s5-1.343 5-3-2.239-3-5-3-5 1.343-5 3zm0 0v6m-5-3v4m10-4v4" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-white mb-1">Account Data</div>
                    <div className="text-sm text-slate-400 font-medium">
                      Export your data, review login sessions, or permanently delete your account.
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => void handleDownloadAccountExport()}
                    disabled={accountActionLoading === 'export'}
                    className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60 text-sm font-bold text-white transition-colors"
                  >
                    {accountActionLoading === 'export' ? 'Exporting...' : 'Export Data'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteAccount()}
                    disabled={accountActionLoading === 'delete'}
                    className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-60 text-sm font-bold text-red-300 border border-red-500/20 transition-colors"
                  >
                    {accountActionLoading === 'delete' ? 'Deleting...' : 'Delete Account'}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Active Login Sessions</div>
                  <div className="text-xs text-slate-400">
                    {authSessionsLoading ? 'Checking active sessions...' : `${authSessions.length} active session${authSessions.length === 1 ? '' : 's'}`}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void refreshAuthSessions()}
                  disabled={authSessionsLoading}
                  className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 text-xs font-bold text-slate-200 transition-colors"
                >
                  Refresh
                </button>
              </div>

              {authSessionsLoading && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm font-medium text-slate-400">
                  Loading login sessions...
                </div>
              )}

              {!authSessionsLoading && authSessions.length === 0 && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-5 text-sm font-medium text-slate-400">
                  No active login sessions were found.
                </div>
              )}

              {!authSessionsLoading && authSessions.map((session) => (
                <div key={session.id} className="rounded-xl border border-white/5 bg-black/20 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm font-bold text-white">
                          {session.userAgent || 'Unknown browser'}
                        </div>
                        {session.current && (
                          <span className="shrink-0 rounded-full border border-emerald-500/30 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            Current
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {session.ipAddress || 'Unknown network'} - Last seen {formatLastActive(session.lastSeenAt)}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Expires {session.expiresAt ? new Date(session.expiresAt).toLocaleString() : 'later'}
                      </div>
                    </div>
                    {!session.current && !session.revokedAt && (
                      <button
                        type="button"
                        onClick={() => void handleRevokeAuthSession(session.id)}
                        disabled={accountActionLoading === `session:${session.id}`}
                        className="shrink-0 px-4 py-2 text-xs font-bold bg-red-500/10 hover:bg-red-500/20 disabled:opacity-60 disabled:cursor-not-allowed text-red-400 rounded-lg transition-all border border-red-500/20"
                      >
                        {accountActionLoading === `session:${session.id}` ? 'Revoking...' : 'Revoke'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/80 backdrop-blur-3xl rounded-[2rem] p-8 max-w-md w-full border border-white/10 shadow-2xl ring-1 ring-white/5 animate-fadeIn">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-white">Change Password</h2>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
                  setError('');
                }}
                className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Current Password</label>
                <input
                  type="password"
                  value={passwordData.currentPassword}
                  onChange={(e) => setPasswordData({...passwordData, currentPassword: e.target.value})}
                  className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                  placeholder="Enter current password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">New Password</label>
                <input
                  type="password"
                  value={passwordData.newPassword}
                  onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                  minLength={PASSWORD_POLICY.minLength}
                  className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                  placeholder="Enter new password"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Confirm New Password</label>
                <input
                  type="password"
                  value={passwordData.confirmPassword}
                  onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                  minLength={PASSWORD_POLICY.minLength}
                  className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all backdrop-blur-sm"
                  placeholder="Confirm new password"
                />
              </div>
              <button
                onClick={handleChangePassword}
                className="w-full px-6 py-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-2xl transition-all font-bold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:-translate-y-0.5 active:translate-y-0 mt-2"
              >
                Update Password
              </button>
            </div>
          </div>
        </div>
      )}

      {twoFactorModalMode && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/80 backdrop-blur-3xl rounded-[2rem] p-8 max-w-md w-full border border-white/10 shadow-2xl ring-1 ring-white/5 animate-fadeIn">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl font-bold text-white">
                  {twoFactorModalMode === 'disable'
                    ? 'Disable Two-Factor Authentication'
                    : twoFactorBackupCodes.length > 0
                      ? 'Save Your Backup Codes'
                      : 'Set Up Two-Factor Authentication'}
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  {twoFactorModalMode === 'disable'
                    ? 'Confirm with your password and a current authenticator code.'
                    : twoFactorBackupCodes.length > 0
                      ? 'Store these recovery codes somewhere safe before closing this dialog.'
                      : 'Scan the QR code with your authenticator app, then enter the current code.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeTwoFactorModal}
                className="text-slate-400 hover:text-white transition-colors p-2 hover:bg-white/10 rounded-full"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {twoFactorModalMode === 'setup' && twoFactorBackupCodes.length === 0 && (
              <div className="space-y-5">
                {twoFactorSetup?.qrCode && (
                  <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                    <img
                      src={twoFactorSetup.qrCode}
                      alt="Two-factor QR code"
                      className="mx-auto w-52 rounded-2xl bg-white p-3"
                    />
                  </div>
                )}

                {twoFactorSetup?.secret && (
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-emerald-300/70">Manual Secret</div>
                    <div className="mt-2 break-all font-mono text-sm text-emerald-100">{twoFactorSetup.secret}</div>
                  </div>
                )}

                <div className="space-y-2">
                  <label htmlFor="two-factor-enable-token" className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Authenticator Code</label>
                  <input
                    id="two-factor-enable-token"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={twoFactorForm.token}
                    onChange={(e) => setTwoFactorForm((currentValue) => ({
                      ...currentValue,
                      token: e.target.value.replace(/\s+/g, '')
                    }))}
                    className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all backdrop-blur-sm"
                    placeholder="Enter the 6-digit code"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleEnableTwoFactor}
                  disabled={twoFactorBusy}
                  className="w-full px-6 py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl transition-all font-bold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 active:translate-y-0 mt-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {twoFactorBusy ? 'Enabling...' : 'Enable 2FA'}
                </button>
              </div>
            )}

            {twoFactorModalMode === 'setup' && twoFactorBackupCodes.length > 0 && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Each code can be used once if you lose access to your authenticator app.
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {twoFactorBackupCodes.map((code) => (
                    <div
                      key={code}
                      className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-center font-mono text-sm font-semibold text-white"
                    >
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleCopyBackupCodes}
                    className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/10"
                  >
                    Copy Codes
                  </button>
                  <button
                    type="button"
                    onClick={handleEnableTwoFactor}
                    className="flex-1 rounded-2xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-400"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {twoFactorModalMode === 'disable' && (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label htmlFor="two-factor-disable-password" className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Current Password</label>
                  <input
                    id="two-factor-disable-password"
                    type="password"
                    value={twoFactorForm.password}
                    onChange={(e) => setTwoFactorForm((currentValue) => ({
                      ...currentValue,
                      password: e.target.value
                    }))}
                    className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all backdrop-blur-sm"
                    placeholder="Enter your password"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="two-factor-disable-token" className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Authenticator Code</label>
                  <input
                    id="two-factor-disable-token"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={twoFactorForm.token}
                    onChange={(e) => setTwoFactorForm((currentValue) => ({
                      ...currentValue,
                      token: e.target.value.replace(/\s+/g, '')
                    }))}
                    className="w-full px-5 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white font-medium placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:border-rose-500/50 transition-all backdrop-blur-sm"
                    placeholder="Enter the 6-digit code"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDisableTwoFactor}
                  disabled={twoFactorBusy}
                  className="w-full px-6 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl transition-all font-bold shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 hover:-translate-y-0.5 active:translate-y-0 mt-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {twoFactorBusy ? 'Disabling...' : 'Disable 2FA'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderAppearanceSection = () => (
    <div className="space-y-6">
      <div className="bg-slate-900/10 backdrop-blur-[40px] rounded-3xl p-8 border border-white/10 shadow-2xl">
        <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-4">
          <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20">
            <svg className="w-6 h-6 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z"
              />
            </svg>
          </div>
          Appearance
        </h3>

        <div className="space-y-8">
          {/* Theme Selector */}
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 block ml-1">Theme</label>
            <div className="grid grid-cols-3 gap-4">
              {/* System Default */}
              <button
                onClick={() => setTheme('system')}
                className={`p-5 rounded-2xl border transition-all flex flex-col items-start gap-4 group hover:scale-[1.02] ${
                  theme === 'system'
                    ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
                }`}
              >                  <div className="w-full h-24 rounded-xl overflow-hidden border border-white/10 shadow-inner relative">
                  <div className="h-full flex relative overflow-hidden">
                    <div className="w-1/2 bg-slate-900 flex items-center justify-center relative">
                      <svg className="w-8 h-8 text-slate-400 group-hover:scale-110 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                      <div className="absolute top-2 left-2 w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse"></div>
                      <div className="absolute bottom-2 right-2 w-2 h-2 bg-violet-400 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                    </div>
                    <div className="w-1/2 bg-slate-100 flex items-center justify-center relative">
                      <svg className="w-8 h-8 text-amber-500 group-hover:scale-110 transition-transform duration-500 group-hover:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse"></div>
                      <div className="absolute bottom-2 left-2 w-2 h-2 bg-orange-400 rounded-full animate-pulse" style={{animationDelay: '0.3s'}}></div>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-shimmer pointer-events-none"></div>
                  </div>
                </div>
                <div>
                  <div className="text-base font-bold text-white mb-0.5">System Default</div>
                  <div className="text-xs text-slate-400 font-medium">
                    Follows device theme
                  </div>
                </div>
              </button>

              {/* Light */}
              <button
                onClick={() => setTheme('light')}
                className={`p-5 rounded-2xl border transition-all flex flex-col items-start gap-4 group hover:scale-[1.02] ${
                  theme === 'light'
                    ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
                }`}
              >
                <div className="w-full h-24 rounded-xl overflow-hidden border border-white/20 shadow-inner bg-white p-3 flex flex-col gap-2 relative">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-400 to-violet-500 group-hover:scale-110 transition-transform duration-300"></div>
                    <div className="h-2 bg-slate-200 rounded-full flex-1 group-hover:bg-slate-300 transition-colors"></div>
                  </div>
                  <div className="h-2.5 bg-slate-200 rounded-full w-3/4 group-hover:bg-indigo-200 transition-colors"></div>
                  <div className="h-2.5 bg-slate-300 rounded-full w-full group-hover:bg-indigo-100 transition-colors"></div>
                  <div className="h-2.5 bg-slate-200 rounded-full w-2/3 group-hover:bg-indigo-200 transition-colors"></div>
                  <div className="flex gap-1.5 mt-auto">
                    <div className="h-2.5 w-2.5 bg-indigo-400 rounded-full group-hover:scale-125 transition-transform"></div>
                    <div className="h-2.5 w-2.5 bg-slate-300 rounded-full group-hover:bg-indigo-300 transition-colors"></div>
                    <div className="h-2.5 w-2.5 bg-slate-300 rounded-full group-hover:bg-indigo-200 transition-colors"></div>
                  </div>
                  <div className="absolute top-2 right-2 w-2 h-2 bg-amber-400 rounded-full animate-pulse"></div>
                </div>
                <div>
                  <div className="text-base font-bold text-white mb-0.5">Light</div>
                  <div className="text-xs text-slate-400 font-medium">
                    Bright and clean
                  </div>
                </div>
              </button>

              {/* Dark */}
              <button
                onClick={() => setTheme('dark')}
                className={`p-5 rounded-2xl border transition-all flex flex-col items-start gap-4 group hover:scale-[1.02] ${
                  theme === 'dark'
                    ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
                }`}
              >
                <div className="w-full h-24 rounded-xl overflow-hidden border border-white/10 shadow-inner bg-slate-900 p-3 flex flex-col gap-2 relative">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 group-hover:scale-110 transition-transform duration-300 shadow-lg shadow-indigo-500/50"></div>
                    <div className="h-2 bg-slate-700 rounded-full flex-1 group-hover:bg-slate-600 transition-colors"></div>
                  </div>
                  <div className="h-2.5 bg-slate-700 rounded-full w-3/4 group-hover:bg-indigo-900 transition-colors"></div>
                  <div className="h-2.5 bg-slate-600 rounded-full w-full group-hover:bg-indigo-800 transition-colors"></div>
                  <div className="h-2.5 bg-slate-700 rounded-full w-2/3 group-hover:bg-indigo-900 transition-colors"></div>
                  <div className="flex gap-1.5 mt-auto">
                    <div className="h-2.5 w-2.5 bg-indigo-500 rounded-full group-hover:scale-125 transition-transform shadow-lg shadow-indigo-500/50"></div>
                    <div className="h-2.5 w-2.5 bg-slate-700 rounded-full group-hover:bg-indigo-700 transition-colors"></div>
                    <div className="h-2.5 w-2.5 bg-slate-700 rounded-full group-hover:bg-indigo-800 transition-colors"></div>
                  </div>
                  <div className="absolute top-2 right-2 w-2 h-2 bg-violet-400 rounded-full animate-pulse"></div>
                  <div className="absolute bottom-2 left-2 w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" style={{animationDelay: '0.5s'}}></div>
                </div>
                <div>
                  <div className="text-base font-bold text-white mb-0.5">Dark</div>
                  <div className="text-xs text-slate-400 font-medium">
                    Easy on the eyes
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Font Type Selector */}
          <div className="pt-6 border-t border-white/5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 block ml-1">Font Type</label>
            <div className="grid grid-cols-3 gap-4">
              {/* Inter */}
              <button
                onClick={() => setFontType('inter')}
                className={`p-5 rounded-2xl border transition-all text-left group hover:scale-[1.02] ${
                  fontType === 'inter'
                    ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
                }`}
              >                  <div className="mb-4 p-4 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-white/5 group-hover:border-indigo-500/30 transition-all">
                  <p className="text-sm text-slate-300 font-medium leading-relaxed" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <div className="h-1.5 w-8 bg-indigo-500 rounded-full"></div>
                    <div className="h-1.5 w-4 bg-indigo-400 rounded-full"></div>
                    <div className="h-1.5 w-6 bg-indigo-300 rounded-full"></div>
                  </div>
                </div>
                <div className="text-base font-bold text-white mb-0.5" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
                  Inter
                </div>
                <div
                  className="text-xs text-slate-400 font-medium"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                >
                  Clean & modern
                </div>
              </button>

              {/* Roboto */}
              <button
                onClick={() => setFontType('roboto')}
                className={`p-5 rounded-2xl border transition-all text-left group hover:scale-[1.02] ${
                  fontType === 'roboto'
                    ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
                }`}
              >                  <div className="mb-4 p-4 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-white/5 group-hover:border-indigo-500/30 transition-all">
                  <p className="text-sm text-slate-300 font-medium leading-relaxed" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <div className="h-1.5 w-8 bg-emerald-500 rounded-full"></div>
                    <div className="h-1.5 w-4 bg-emerald-400 rounded-full"></div>
                    <div className="h-1.5 w-6 bg-emerald-300 rounded-full"></div>
                  </div>
                </div>
                <div className="text-base font-bold text-white mb-0.5" style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}>
                  Roboto
                </div>
                <div
                  className="text-xs text-slate-400 font-medium"
                  style={{ fontFamily: 'Roboto, system-ui, sans-serif' }}
                >
                  Friendly & readable
                </div>
              </button>

              {/* Poppins */}
              <button
                onClick={() => setFontType('poppins')}
                className={`p-5 rounded-2xl border transition-all text-left group hover:scale-[1.02] ${
                  fontType === 'poppins'
                    ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/50 shadow-lg shadow-indigo-500/20'
                    : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
                }`}
              >                  <div className="mb-4 p-4 bg-slate-800/50 backdrop-blur-sm rounded-xl border border-white/5 group-hover:border-indigo-500/30 transition-all">
                  <p className="text-sm text-slate-300 font-medium leading-relaxed" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
                    The quick brown fox jumps over the lazy dog
                  </p>
                  <div className="mt-3 flex gap-1.5">
                    <div className="h-1.5 w-8 bg-violet-500 rounded-full"></div>
                    <div className="h-1.5 w-4 bg-violet-400 rounded-full"></div>
                    <div className="h-1.5 w-6 bg-violet-300 rounded-full"></div>
                  </div>
                </div>
                <div className="text-base font-bold text-white mb-0.5" style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}>
                  Poppins
                </div>
                <div
                  className="text-xs text-slate-400 font-medium"
                  style={{ fontFamily: 'Poppins, system-ui, sans-serif' }}
                >
                  Rounded & playful
                </div>
              </button>
            </div>
          </div>

          {/* Font Size Slider */}
          <div className="pt-6 border-t border-white/5">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 block ml-1">Font Size</label>
            <div className="flex items-center gap-6">
              <span className="text-xs text-slate-400 font-bold">A</span>
              <div className="flex-1 relative group">
                <div className="absolute top-1/2 left-0 right-0 h-1.5 bg-white/10 rounded-full -translate-y-1/2 group-hover:bg-white/20 transition-colors"></div>
                <input 
                  type="range" 
                  min="12" 
                  max="20" 
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
                  className="relative w-full h-2 bg-transparent rounded-lg appearance-none cursor-pointer z-10"
                  style={{
                    background: 'transparent'
                  }}
                />
                <style>{`
                  input[type="range"]::-webkit-slider-thumb {
                    appearance: none;
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #6366f1;
                    cursor: pointer;
                    box-shadow: 0 0 15px rgba(99, 102, 241, 0.5);
                    border: 4px solid white;
                    transition: transform 0.2s;
                  }
                  input[type="range"]::-webkit-slider-thumb:hover {
                    transform: scale(1.1);
                  }
                  input[type="range"]::-moz-range-thumb {
                    width: 24px;
                    height: 24px;
                    border-radius: 50%;
                    background: #6366f1;
                    cursor: pointer;
                    box-shadow: 0 0 15px rgba(99, 102, 241, 0.5);
                    border: 4px solid white;
                    transition: transform 0.2s;
                  }
                  input[type="range"]::-moz-range-thumb:hover {
                    transform: scale(1.1);
                  }
                  @keyframes shimmer {
                    0% { transform: translateX(-100%); }
                    100% { transform: translateX(100%); }
                  }
                  .group-hover\\:animate-shimmer {
                    animation: shimmer 1.5s infinite;
                  }
                `}</style>
              </div>
              <span className="text-xl text-slate-400 font-bold">A</span>
            </div>
            <div className="mt-6 p-6 rounded-2xl bg-white/5 backdrop-blur-sm border border-white/10">
              <p className="text-slate-300 font-medium leading-relaxed" style={{ fontSize: `${fontSize}px`, fontFamily: getFontFamily() }}>
                Preview text at {fontSize}px using {fontType.charAt(0).toUpperCase() + fontType.slice(1)} font. The quick brown fox jumps over the lazy dog.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderNotificationsSection = () => {
    const enabledCount = Object.values(notifications).filter(Boolean).length;
    const pushDescription = !pushStatus.supported
      ? 'This browser does not support push notifications.'
      : !pushStatus.serverConfigured
        ? 'Push notifications are not configured on the server yet.'
        : pushStatus.permission === 'denied'
          ? 'Browser notifications are blocked for this site.'
          : notifications.push
            ? 'You will receive instant push alerts for important activity.'
            : 'Push alerts are currently disabled.';
    const pushBadgeLabel = !pushStatus.supported
      ? 'Unsupported'
      : pushToggleLoading
        ? 'Syncing'
        : notifications.push
          ? 'On'
          : 'Off';

    return (
      <div className="space-y-6">
        <div className="bg-slate-900/10 backdrop-blur-[40px] rounded-3xl p-8 border border-white/10 shadow-2xl">
          <h3 className="text-2xl font-bold text-white mb-8 flex items-center gap-4">
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20">
              <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </div>
            Notifications
          </h3>

          {/* Top hint */}
          <div className="mb-6 px-5 py-4 rounded-2xl bg-indigo-500/10 backdrop-blur-xl border border-indigo-500/20 flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 11-10 10A10.011 10.011 0 0112 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-slate-300 font-medium">
                Browser push is the only notification channel available in this build.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {/* Push Notifications */}
            <button
              type="button"
              onClick={() => toggleNotification('push')}
              disabled={pushToggleLoading || !pushStatus.supported || !pushStatus.serverConfigured}
              className={`w-full flex items-center justify-between p-5 rounded-2xl border transition-all duration-300 transform hover:scale-[1.01] group ${
                notifications.push
                  ? 'bg-indigo-500/10 backdrop-blur-xl border-indigo-500/30 shadow-lg shadow-indigo-500/10'
                  : 'bg-white/5 backdrop-blur-xl border-white/10 hover:border-indigo-400/30 hover:bg-white/10'
              } ${pushToggleLoading || !pushStatus.supported || !pushStatus.serverConfigured ? 'cursor-not-allowed opacity-70' : ''}`}
            >
              <div className="flex items-start gap-4">
                <div className="mt-1 w-10 h-10 rounded-xl bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                  <svg className="w-5 h-5 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                    />
                  </svg>
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`text-base font-bold ${notifications.push ? 'text-white' : 'text-slate-300'}`}>
                      Push Notifications
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-slate-800/50 backdrop-blur-sm text-slate-300 border border-white/10">
                      Real-time
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 font-medium">
                    {pushDescription}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div
                  className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                    notifications.push ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-700/50 text-slate-400 border border-white/10'
                  }`}
                >
                  {pushBadgeLabel}
                </div>
                <div
                  className={`w-12 h-6 rounded-full relative transition-all duration-300 ${
                    notifications.push ? 'bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.4)]' : 'bg-slate-700/50'
                  }`}
                >
                  <div
                    className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all duration-300 shadow-sm ${
                      notifications.push ? 'right-0.5' : 'left-0.5 bg-slate-400'
                    }`}
                  ></div>
                </div>
              </div>
            </button>

          </div>

          {/* Notification Summary Panel */}
          <div className="mt-8 p-6 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-violet-500/10 backdrop-blur-xl border border-indigo-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 backdrop-blur-sm flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div>
                  <div className="text-base font-bold text-white">Notification Summary</div>
                  <div className="text-xs text-slate-400 font-medium">
                    {enabledCount} of 1 delivery channel enabled
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-3xl font-bold text-indigo-300">{enabledCount}</div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active</div>
                </div>
              </div>
            </div>
            <div className="mt-4 flex gap-2 flex-wrap">
              {notifications.push && (                  <span className="px-3 py-1.5 text-[11px] font-bold bg-indigo-500/20 backdrop-blur-sm text-indigo-300 rounded-lg border border-indigo-500/30">
                  Push
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const sections = [
    { id: "profile", name: "Profile", icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" },
    { id: "privacy", name: "Privacy", icon: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" },
    { id: "appearance", name: "Appearance", icon: "M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" },
    { id: "notifications", name: "Notifications", icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" }
  ];

  const renderContent = () => {
    switch (activeSection) {
      case "profile":
        return renderProfileSection();
      case "privacy":
        return renderPrivacySection();
      case "appearance":
        return renderAppearanceSection();
      case "notifications":
        return renderNotificationsSection();
      default:
        return renderProfileSection();
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
      {showAvatarModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(5,5,7,0.85)', backdropFilter: 'var(--glass-blur)' }}>
          <div className="rounded-lg p-6 max-w-2xl w-full max-h-screen overflow-y-auto border border-bd" style={{ background: 'var(--bg-panel)' }}>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-display font-semibold text-tx-primary tracking-tight">Edit Avatar</h2>
              <button
                onClick={() => setShowAvatarModal(false)}
                className="text-tx-muted hover:text-tx-primary transition-colors-fast p-1 cursor-pointer bg-transparent border-none"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="mb-6">
              <h3 className="text-xs font-mono uppercase tracking-widest text-tx-muted mb-3">Choose an avatar</h3>
              <div className="grid grid-cols-4 gap-3">
                {avatarOptions.map((avatar, index) => (
                  <button
                    key={index}
                    onClick={() => handleSelectAvatar(avatar)}
                    className="aspect-square rounded-lg overflow-hidden border border-bd hover:border-bd-accent transition-colors-fast cursor-pointer"
                    style={{ background: 'var(--bg-card)' }}
                  >
                    <img src={avatar} alt={`Avatar ${index + 1}`} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-xs font-ui font-medium transition-colors-fast cursor-pointer border border-bd-accent bg-accent-dim text-accent hover:bg-accent/20 mb-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Upload Picture
            </button>
            {avatarUrl && (
              <button
                onClick={handleRemoveAvatar}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-md text-xs font-ui font-medium transition-colors-fast cursor-pointer border bg-transparent text-danger hover:bg-danger/10"
                style={{ borderColor: 'rgba(255,68,102,0.25)' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Remove Picture
              </button>
            )}
          </div>
        </div>
      )}

      <div className="flex-shrink-0 border-b border-bd-subtle z-10" style={{ background: 'var(--bg-panel)' }}>
        <div className="flex items-center gap-3 h-14 px-6 max-w-7xl mx-auto w-full">
          <svg className="w-5 h-5 text-tx-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <h1 className="text-sm font-display font-semibold text-tx-primary tracking-tight">Settings</h1>
          <span className="text-xs font-ui text-tx-muted">Manage your account and preferences</span>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden max-w-7xl mx-auto w-full">
        <div className="w-56 p-3 hidden md:block shrink-0">
          <nav className="space-y-0.5 rounded-lg border border-bd-subtle p-1.5" style={{ background: 'var(--bg-panel)' }}>
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-md transition-colors-fast cursor-pointer border-none ${
                  activeSection === section.id
                    ? "bg-selected text-tx-primary"
                    : "bg-transparent text-tx-muted hover:bg-hover hover:text-tx-secondary"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={section.icon} />
                </svg>
                <span className="text-xs font-ui font-medium">{section.name}</span>
                {activeSection === section.id && (
                  <div className="ml-auto w-1 h-1 rounded-full bg-accent" style={{ boxShadow: 'var(--accent-glow)' }} />
                )}
              </button>
            ))}
            <div className="pt-1.5 mt-1.5 border-t border-bd-subtle">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 text-left rounded-md transition-colors-fast text-danger hover:bg-danger/10 cursor-pointer border-none bg-transparent"
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-xs font-ui font-medium">Sign Out</span>
              </button>
            </div>
          </nav>
        </div>

        <div className="flex-1 p-4 overflow-y-auto">
          <div className="max-w-3xl mx-auto pb-10">
            <RuntimeStatusBanner className="mb-6" />
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
