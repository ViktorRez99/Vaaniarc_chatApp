import { RefreshCw, WifiOff } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

const PwaRuntimeBanner = () => {
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const [waitingWorker, setWaitingWorker] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const inspectRegistration = (registration) => {
      if (!registration) {
        return () => {};
      }

      if (registration.waiting) {
        setWaitingWorker(registration.waiting);
      }

      const handleUpdateFound = () => {
        const installingWorker = registration.installing;
        if (!installingWorker) {
          return;
        }

        installingWorker.addEventListener('statechange', () => {
          if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(registration.waiting || installingWorker);
          }
        });
      };

      registration.addEventListener('updatefound', handleUpdateFound);

      return () => {
        registration.removeEventListener('updatefound', handleUpdateFound);
      };
    };

    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    const handleControllerChange = () => {
      window.location.reload();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    let detachRegistrationListener = () => {};

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((registration) => {
        detachRegistrationListener = inspectRegistration(registration);
      }).catch(() => {});

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      detachRegistrationListener();

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  const banner = useMemo(() => {
    if (waitingWorker) {
      return {
        key: 'update',
        icon: <RefreshCw className="h-4 w-4" />,
        title: 'Update ready',
        message: 'A newer VaaniArc build is cached locally and ready to activate.',
        actionLabel: 'Refresh now'
      };
    }

    if (isOffline) {
      return {
        key: 'offline',
        icon: <WifiOff className="h-4 w-4" />,
        title: 'Offline mode',
        message: 'The cached app shell is available, and queued realtime sends will retry after the network returns.',
        actionLabel: ''
      };
    }

    return null;
  }, [isOffline, waitingWorker]);

  if (!banner) {
    return null;
  }

  const handleAction = async () => {
    if (banner.key === 'update' && waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  };

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[70] max-w-sm">
      <div className="pointer-events-auto rounded-2xl border bg-black/85 p-4 text-tx-primary shadow-2xl backdrop-blur-2xl" style={{ borderColor: 'var(--border-default)', background: 'rgba(0,0,0,0.85)' }}>
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full p-2" style={{ background: 'rgba(0,240,255,0.10)', color: 'var(--accent)' }}>
            {banner.icon}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-display font-semibold">{banner.title}</p>
            <p className="mt-1 text-sm text-tx-secondary">{banner.message}</p>

            {banner.actionLabel && (
              <button
                type="button"
                onClick={() => { void handleAction(); }}
                className="mt-3 inline-flex items-center rounded-xl px-3.5 py-2 text-sm font-ui font-semibold text-void transition-all cursor-pointer border-none active:scale-95"
                style={{ background: 'var(--accent)' }}
              >
                {banner.actionLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PwaRuntimeBanner;
