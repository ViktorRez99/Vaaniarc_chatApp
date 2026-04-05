import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const DeviceEncryptionResetModal = () => {
  const navigate = useNavigate();
  const {
    encryptionState,
    isDeviceResetPromptOpen,
    isResettingDeviceEncryption,
    deviceResetError,
    closeDeviceEncryptionResetPrompt,
    resetCurrentDeviceEncryption
  } = useAuth();

  if (!isDeviceResetPromptOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
      <div className="w-full max-w-xl rounded-[2rem] border border-rose-400/20 bg-slate-950/90 p-8 shadow-2xl ring-1 ring-white/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white">Reset This Device Encryption</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              The current browser keys do not match the published bundle for this device.
              If you still have a backup, cancel this reset and import it first.
            </p>
          </div>
          <button
            type="button"
            onClick={closeDeviceEncryptionResetPrompt}
            disabled={isResettingDeviceEncryption}
            className="rounded-full p-2 text-slate-400 transition hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="mt-6 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-4 text-sm text-amber-100">
          Resetting will replace this browser&apos;s encryption identity for the current device.
          Old unread encrypted history on this browser will remain unreadable unless you import a backup first.
        </div>

        {(encryptionState?.fingerprint || encryptionState?.serverFingerprint) && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Browser Fingerprint</div>
              <div className="mt-2 break-all font-mono text-xs text-emerald-200">{encryptionState?.fingerprint || 'Unavailable'}</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Published Fingerprint</div>
              <div className="mt-2 break-all font-mono text-xs text-amber-200">{encryptionState?.serverFingerprint || 'Unavailable'}</div>
            </div>
          </div>
        )}

        {deviceResetError && (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {deviceResetError}
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={() => {
              closeDeviceEncryptionResetPrompt();
              navigate('/settings');
            }}
            disabled={isResettingDeviceEncryption}
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel And Import Backup
          </button>
          <button
            type="button"
            onClick={() => {
              void resetCurrentDeviceEncryption();
            }}
            disabled={isResettingDeviceEncryption}
            className="rounded-2xl bg-rose-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isResettingDeviceEncryption ? 'Resetting...' : 'Reset This Device'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DeviceEncryptionResetModal;
