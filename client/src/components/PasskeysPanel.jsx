import { useCallback, useEffect, useMemo, useState } from 'react';

import passkeyService from '../services/passkeys';

const PasskeysPanel = ({
  required = false,
  onPasskeyCreated = null,
  onPasskeysChange = null
}) => {
  const [passkeys, setPasskeys] = useState([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const isSupported = useMemo(() => passkeyService.isSupported(), []);

  const loadPasskeys = useCallback(async () => {
    if (!isSupported) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const nextPasskeys = await passkeyService.list();
      setPasskeys(nextPasskeys);
      onPasskeysChange?.(nextPasskeys);
    } catch (loadError) {
      setError(loadError.message || 'Failed to load passkeys.');
    } finally {
      setLoading(false);
    }
  }, [isSupported, onPasskeysChange]);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  const handleCreatePasskey = async () => {
    setBusy(true);
    setError('');
    setSuccess('');

    try {
      const response = await passkeyService.enroll(label);
      setPasskeys((currentPasskeys) => {
        const nextPasskey = response.passkey;
        const nextPasskeys = [nextPasskey, ...currentPasskeys.filter((passkey) => passkey.id !== nextPasskey.id)];
        onPasskeysChange?.(nextPasskeys);
        return nextPasskeys;
      });
      setLabel('');
      setSuccess('Passkey added successfully.');
      await onPasskeyCreated?.(response);
    } catch (createError) {
      setError(createError.message || 'Failed to add passkey.');
    } finally {
      setBusy(false);
    }
  };

  const handleRevokePasskey = async (passkeyId) => {
    if (!window.confirm('Remove this passkey from your account?')) {
      return;
    }

    setBusy(true);
    setError('');
    setSuccess('');

    try {
      await passkeyService.revoke(passkeyId);
      setPasskeys((currentPasskeys) => currentPasskeys.filter((passkey) => passkey.id !== passkeyId));
      setSuccess('Passkey removed.');
    } catch (revokeError) {
      setError(revokeError.message || 'Failed to remove passkey.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-5">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-500/10">
            <svg className="h-7 w-7 text-sky-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0-2.761 2.239-5 5-5m-5 5a5 5 0 00-5-5m5 5v4m0 0H9m3 0h3m5 3a9 9 0 11-16 0 9 9 0 0116 0z" />
            </svg>
          </div>
          <div>
            <div className="mb-1 text-lg font-bold text-white">
              {required ? 'Passkey Required' : 'Passkeys'}
            </div>
            <div className="text-sm font-medium text-slate-300">
              {required
                ? 'Create a passkey to finish account setup and unlock the app.'
                : 'Use a platform authenticator instead of typing your password on every sign-in.'}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void loadPasskeys()}
          disabled={loading || busy}
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          Refresh
        </button>
      </div>

      {!isSupported && (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          This browser does not support passkeys yet.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
          {success}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          disabled={!isSupported || busy}
          placeholder="Optional label, for example Personal Laptop"
          className="h-11 flex-1 rounded-xl border border-white/10 bg-black/20 px-4 text-sm text-white outline-none transition focus:border-sky-400/40 focus:ring-1 focus:ring-sky-400/40 disabled:cursor-not-allowed disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void handleCreatePasskey()}
          disabled={!isSupported || busy}
          className="rounded-xl bg-sky-500 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Working...' : 'Add Passkey'}
        </button>
      </div>

      <div className="mt-5 space-y-3">
        {loading && (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-400">
            Loading passkeys...
          </div>
        )}

        {!loading && isSupported && passkeys.length === 0 && (
          <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-4 text-sm text-slate-400">
            No passkeys are enrolled on this account yet.
          </div>
        )}

        {!loading && passkeys.map((passkey) => (
          <div key={passkey.id} className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/20 px-4 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{passkey.label || 'Passkey'}</span>
                {passkey.isCurrentDevice && (
                  <span className="rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                    Current browser
                  </span>
                )}
                {passkey.backedUp && (
                  <span className="rounded-full border border-sky-500/30 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-300">
                    Synced
                  </span>
                )}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                Added {new Date(passkey.createdAt).toLocaleString()}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Last used {passkey.lastUsedAt ? new Date(passkey.lastUsedAt).toLocaleString() : 'Never'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleRevokePasskey(passkey.id)}
              disabled={busy}
              className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasskeysPanel;
