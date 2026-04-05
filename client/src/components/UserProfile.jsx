import {
  Calendar,
  Clock,
  Copy,
  MessageCircle,
  Phone,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  User as UserIcon,
  Video,
  X
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import cryptoService from '../services/cryptoService';

const UserProfile = ({ user: initialUser, onClose, onStartChat }) => {
  const { encryptionState } = useAuth();
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(false);
  const [securityInfo, setSecurityInfo] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securityError, setSecurityError] = useState('');
  const [securitySuccess, setSecuritySuccess] = useState('');

  useEffect(() => {
    setUser(initialUser);
  }, [initialUser]);

  // Refresh contact data when the viewed user changes.
  useEffect(() => {
    if (!initialUser?._id) {
      return;
    }

    void fetchUserDetails();
    void fetchSecurityInfo();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUser?._id]);

  const showTransientMessage = (setter, message) => {
    setter(message);
    window.setTimeout(() => setter(''), 3000);
  };

  const fetchUserDetails = async () => {
    if (!initialUser?._id) {
      return;
    }

    setLoading(true);
    try {
      const response = await api.get(`/users/${initialUser._id}`);
      setUser(response || initialUser);
    } catch (error) {
      console.error('Error fetching user details:', error);
      setUser(initialUser);
    } finally {
      setLoading(false);
    }
  };

  const fetchSecurityInfo = async () => {
    if (!initialUser?._id) {
      return;
    }

    setSecurityLoading(true);
    setSecurityError('');

    try {
      const nextSecurityInfo = await cryptoService.getUserSecurityInfo(initialUser._id);
      setSecurityInfo(nextSecurityInfo);
    } catch (error) {
      console.error('Error fetching user security info:', error);
      setSecurityError(error.message || 'Failed to load the contact fingerprint.');
      setSecurityInfo(null);
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleCopyFingerprint = async () => {
    if (!securityInfo?.fingerprint) {
      showTransientMessage(setSecurityError, 'No fingerprint is available for this contact.');
      return;
    }

    try {
      await navigator.clipboard.writeText(securityInfo.fingerprint);
      showTransientMessage(setSecuritySuccess, 'Fingerprint copied.');
    } catch {
      showTransientMessage(setSecurityError, 'Failed to copy the fingerprint.');
    }
  };

  const handleVerifyFingerprint = async () => {
    if (!user?._id) {
      return;
    }

    try {
      const nextSecurityInfo = await cryptoService.verifyUserFingerprint(user._id);
      setSecurityInfo(nextSecurityInfo);
      showTransientMessage(setSecuritySuccess, 'Contact fingerprint verified on this device.');
    } catch (error) {
      showTransientMessage(setSecurityError, error.message || 'Failed to verify this fingerprint.');
    }
  };

  const handleRemoveVerification = async () => {
    if (!user?._id) {
      return;
    }

    try {
      const nextSecurityInfo = await cryptoService.unverifyUserFingerprint(user._id);
      setSecurityInfo(nextSecurityInfo);
      showTransientMessage(setSecuritySuccess, 'Contact verification removed.');
    } catch (error) {
      showTransientMessage(setSecurityError, error.message || 'Failed to remove verification.');
    }
  };

  const securityState = useMemo(() => {
    if (securityLoading) {
      return {
        icon: <RefreshCw className="w-4 h-4 animate-spin text-sky-300" />,
        badge: 'Checking',
        badgeClass: 'border-sky-500/20 bg-sky-500/10 text-sky-200',
        message: 'Loading the contact fingerprint...'
      };
    }

    if (securityInfo?.status === 'verified') {
      return {
        icon: <ShieldCheck className="w-4 h-4 text-emerald-300" />,
        badge: 'Verified',
        badgeClass: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-200',
        message: securityInfo.message
      };
    }

    if (securityInfo?.status === 'changed') {
      return {
        icon: <ShieldAlert className="w-4 h-4 text-amber-300" />,
        badge: 'Changed',
        badgeClass: 'border-amber-500/20 bg-amber-500/10 text-amber-100',
        message: securityInfo.message
      };
    }

    if (securityInfo?.status === 'no_identity') {
      return {
        icon: <Shield className="w-4 h-4 text-slate-400" />,
        badge: 'Unavailable',
        badgeClass: 'border-white/10 bg-white/5 text-white/60',
        message: securityInfo.message
      };
    }

    return {
      icon: <Shield className="w-4 h-4 text-indigo-300" />,
      badge: 'Unverified',
      badgeClass: 'border-indigo-500/20 bg-indigo-500/10 text-indigo-100',
      message: securityInfo?.message || 'Compare this fingerprint with the contact before marking it as verified.'
    };
  }, [securityInfo, securityLoading]);

  if (!user) {
    return (
      <div className="w-96 border-l border-[#2a2f32] bg-[#111b21] flex items-center justify-center">
        <p className="text-[#8696a0]">No user selected</p>
      </div>
    );
  }

  const formatDate = (date) => new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const formatLastSeen = (date) => {
    const now = new Date();
    const lastSeen = new Date(date);
    const diff = now - lastSeen;

    if (diff < 60000) {
      return 'Just now';
    }

    if (diff < 3600000) {
      return `${Math.floor(diff / 60000)} minutes ago`;
    }

    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)} hours ago`;
    }

    return formatDate(date);
  };

  return (
    <div className="w-96 border-l border-[#2a2f32] bg-[#111b21] flex flex-col">
      <div className="p-4 border-b border-[#2a2f32] flex items-center justify-between bg-[#202c33]">
        <h3 className="text-lg font-semibold text-[#e9edef]">Contact Info</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 border-b border-[#2a2f32] flex items-center justify-around gap-3">
        <button
          onClick={() => {
            if (onStartChat) {
              onStartChat(user);
            }
            onClose();
          }}
          className="flex-1 flex flex-col items-center space-y-1 py-3 bg-[#202c33] hover:bg-[#2a3942] rounded-lg transition-colors focus:outline-none"
        >
          <MessageCircle className="w-6 h-6 text-[#00a884]" />
          <span className="text-xs text-[#8696a0]">Message</span>
        </button>
        <button className="flex-1 flex flex-col items-center space-y-1 py-3 bg-[#202c33] hover:bg-[#2a3942] rounded-lg transition-colors focus:outline-none">
          <Phone className="w-6 h-6 text-[#00a884]" />
          <span className="text-xs text-[#8696a0]">Audio</span>
        </button>
        <button className="flex-1 flex flex-col items-center space-y-1 py-3 bg-[#202c33] hover:bg-[#2a3942] rounded-lg transition-colors focus:outline-none">
          <Video className="w-6 h-6 text-[#00a884]" />
          <span className="text-xs text-[#8696a0]">Video</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-6 text-center border-b border-[#2a2f32] bg-[#111b21]">
          <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user.username || 'User'}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-4xl font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <h2 className="text-2xl font-medium text-[#e9edef] mb-1">{user?.username || 'Unknown User'}</h2>
          <div className="flex items-center justify-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              user?.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
            }`}></div>
            <span className="text-[#8696a0] text-sm">
              {user?.status === 'online' ? 'Online' : user?.lastSeen ? `Last seen ${formatLastSeen(user.lastSeen)}` : 'Offline'}
            </span>
          </div>
          {loading && (
            <p className="mt-3 text-xs text-[#8696a0]">Refreshing contact details...</p>
          )}
        </div>

        <div className="p-6 border-b border-[#2a2f32]">
          <h4 className="text-sm font-medium text-[#00a884] mb-3">About</h4>
          <p className="text-[#e9edef]">
            {user?.bio || 'Hey there! I am using VaaniArc'}
          </p>
        </div>

        <div className="p-6 border-b border-[#2a2f32] space-y-4">
          <h4 className="text-sm font-medium text-[#00a884] mb-3">Contact Info</h4>

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-[#8696a0]">Username</p>
              <p className="text-[#e9edef]">@{user?.username || 'unknown'}</p>
            </div>
          </div>
        </div>

        <div className="p-6 border-b border-[#2a2f32] space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h4 className="text-sm font-medium text-[#00a884]">Encryption Safety</h4>
            <button
              onClick={() => void fetchSecurityInfo()}
              className="p-2 rounded-lg bg-slate-800/50 hover:bg-slate-700/60 transition-colors"
              title="Refresh fingerprint"
            >
              <RefreshCw className={`w-4 h-4 text-[#8696a0] ${securityLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {securityError && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              {securityError}
            </div>
          )}

          {securitySuccess && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {securitySuccess}
            </div>
          )}

          <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[#e9edef]">
                {securityState.icon}
                <span className="font-medium">Contact Fingerprint</span>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${securityState.badgeClass}`}>
                {securityState.badge}
              </span>
            </div>

            <p className="text-sm text-[#8696a0]">{securityState.message}</p>

            {securityInfo?.fingerprint && (
              <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.25em] text-[#8696a0] mb-2">Safety Number</p>
                <p className="break-all font-mono text-xs text-[#e9edef]">{securityInfo.fingerprint}</p>
              </div>
            )}

            {securityInfo?.transparencyStatus && securityInfo.transparencyStatus !== 'missing' && (
              <div className={`rounded-xl border px-3 py-3 text-xs ${
                securityInfo.transparencyStatus === 'tampered'
                  ? 'border-red-500/20 bg-red-500/10 text-red-100'
                  : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-100'
              }`}>
                <p className="text-[10px] uppercase tracking-[0.25em] mb-2 opacity-70">Key Transparency</p>
                <p>
                  {securityInfo.transparencyStatus === 'tampered'
                    ? 'The published device-key history chain could not be verified on this browser.'
                    : `The published device-key history chain verified across ${securityInfo.transparencyEntryCount || 0} entries.`}
                </p>
              </div>
            )}

            {securityInfo?.trustedFingerprint && securityInfo.trustedFingerprint !== securityInfo.fingerprint && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.25em] text-amber-200/70 mb-2">Previously Trusted</p>
                <p className="break-all font-mono text-xs text-amber-100">{securityInfo.trustedFingerprint}</p>
              </div>
            )}

            {encryptionState?.status !== 'ready' ? (
              <p className="text-xs text-amber-200">
                {encryptionState?.message || 'Your device encryption key is not ready, so contact verification is limited.'}
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleCopyFingerprint}
                  disabled={!securityInfo?.fingerprint}
                  className="px-3 py-2 rounded-lg bg-slate-800/60 hover:bg-slate-700/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 text-sm text-[#e9edef]"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copy</span>
                </button>
                {securityInfo?.status === 'verified' ? (
                  <button
                    onClick={handleRemoveVerification}
                    className="px-3 py-2 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-sm text-amber-100"
                  >
                    Remove Verification
                  </button>
                ) : (
                  <button
                    onClick={handleVerifyFingerprint}
                    disabled={!securityInfo?.fingerprint}
                    className="px-3 py-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm text-emerald-100"
                  >
                    Mark as Verified
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="p-6 space-y-4">
          <h4 className="text-sm font-medium text-[#00a884] mb-3">Additional Info</h4>

          {user?.joinedAt && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-[#8696a0]">Joined</p>
                <p className="text-[#e9edef]">{formatDate(user.joinedAt)}</p>
              </div>
            </div>
          )}

          {user?.status !== 'online' && user?.lastSeen && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-[#8696a0]">Last Seen</p>
                <p className="text-[#e9edef]">{formatLastSeen(user.lastSeen)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-[#2a2f32] space-y-2">
        <button className="w-full px-4 py-3 bg-[#202c33] hover:bg-[#2a3942] text-[#ea4335] rounded-lg transition-all flex items-center justify-center space-x-2 focus:outline-none">
          <span>Block {user?.username || 'User'}</span>
        </button>
        <button className="w-full px-4 py-3 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] rounded-lg transition-all flex items-center justify-center space-x-2 focus:outline-none">
          <span>Clear Chat</span>
        </button>
      </div>
    </div>
  );
};

export default UserProfile;
