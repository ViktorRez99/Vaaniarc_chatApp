import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import PasskeysPanel from './PasskeysPanel';

const PasskeySetup = () => {
  const navigate = useNavigate();
  const {
    logout,
    refreshPasskeyEnrollment,
    requiresPasskeyEnrollment,
    user
  } = useAuth();
  const [statusMessage, setStatusMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!requiresPasskeyEnrollment) {
      navigate('/chat', { replace: true });
    }
  }, [navigate, requiresPasskeyEnrollment]);

  const handlePasskeyCreated = async () => {
    try {
      setError('');
      setStatusMessage('Finalizing passkey setup...');
      const nextUser = await refreshPasskeyEnrollment();

      if (!nextUser?.passkeyRequired) {
        navigate('/chat', { replace: true });
      } else {
        setError('Passkey setup did not complete. Try adding a passkey again.');
      }
    } catch (setupError) {
      setError(setupError.message || 'Failed to finalize passkey setup.');
    } finally {
      setStatusMessage('');
    }
  };

  const handleSignOut = async () => {
    await logout();
    navigate('/auth', { replace: true });
  };

  return (
    <div className="min-h-screen overflow-y-auto px-4 py-10" style={{ background: 'var(--bg-base)', fontFamily: 'var(--font-body)' }}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 text-amber-100">
          <div className="text-lg font-bold text-white">Finish Securing Your Account</div>
          <div className="mt-2 text-sm text-amber-100/80">
            {user?.username ? `${user.username}, ` : ''}a passkey is required before chat, devices, files, and realtime sync are available.
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {statusMessage && (
          <div className="mb-4 rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {statusMessage}
          </div>
        )}

        <PasskeysPanel required onPasskeyCreated={handlePasskeyCreated} />

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default PasskeySetup;
