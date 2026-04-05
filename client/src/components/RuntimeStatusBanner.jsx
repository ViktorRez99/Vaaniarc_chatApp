import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';

const toneStyles = {
  info: 'border-sky-400/30 bg-sky-500/10 text-sky-100',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-100'
};

const RuntimeStatusBanner = ({ className = '' }) => {
  const {
    isAuthenticated,
    encryptionState,
    bootstrapStatus,
    bootstrapIssue,
    sessionRestoreStatus,
    sessionRestoreMessage,
    realtimeStatus,
    realtimeError,
    retryBootstrap,
    openDeviceEncryptionResetPrompt
  } = useAuth();

  const banner = useMemo(() => {
    if (!isAuthenticated) {
      return null;
    }

    if (sessionRestoreStatus === 'recovering') {
      return {
        tone: 'info',
        title: 'Backend recovering',
        message: sessionRestoreMessage || 'The backend is restarting. Your session will be restored automatically.'
      };
    }

    if (bootstrapStatus === 'running') {
      return {
        tone: 'info',
        title: 'Finishing secure device setup',
        message: 'Your account is signed in. Encryption, device registration, and realtime sync are still starting.'
      };
    }

    if (bootstrapStatus === 'degraded' && bootstrapIssue) {
      return {
        tone: bootstrapIssue.category === 'session' ? 'error' : 'warning',
        title: 'Runtime degraded',
        message: bootstrapIssue.message,
        canRetry: bootstrapIssue.retryable !== false,
        canResetDevice: encryptionState?.status === 'key_mismatch'
      };
    }

    if (realtimeStatus === 'error' || realtimeStatus === 'disconnected') {
      return {
        tone: realtimeStatus === 'error' ? 'warning' : 'info',
        title: realtimeStatus === 'error' ? 'Realtime unavailable' : 'Realtime reconnecting',
        message: realtimeError || 'Chat updates may be delayed until the realtime connection recovers.',
        canRetry: true
      };
    }

    return null;
  }, [
    bootstrapIssue,
    bootstrapStatus,
    encryptionState?.status,
    isAuthenticated,
    realtimeError,
    realtimeStatus,
    sessionRestoreMessage,
    sessionRestoreStatus
  ]);

  if (!banner) {
    return null;
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 shadow-lg backdrop-blur-xl ${toneStyles[banner.tone]} ${className}`}
      data-testid="runtime-status-banner"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold">{banner.title}</p>
          <p className="mt-1 text-sm opacity-90">{banner.message}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {banner.canResetDevice && (
            <button
              type="button"
              onClick={openDeviceEncryptionResetPrompt}
              className="rounded-xl border border-current/20 bg-black/10 px-3 py-2 text-sm font-medium transition hover:bg-black/20"
            >
              Reset this device
            </button>
          )}

          {banner.canRetry && (
            <button
              type="button"
              onClick={() => {
                void retryBootstrap();
              }}
              className="rounded-xl border border-current/20 bg-black/10 px-3 py-2 text-sm font-medium transition hover:bg-black/20"
            >
              Retry setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RuntimeStatusBanner;
