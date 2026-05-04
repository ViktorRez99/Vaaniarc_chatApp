const CHANNEL_NAME = 'vaaniarc-runtime';
const STORAGE_EVENT_KEY = 'vaaniarc-runtime-sync';

const listeners = new Set();
let broadcastChannel = null;
let storageListenerAttached = false;

const emitToListeners = (event) => {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch (error) {
      console.error('Runtime coordinator listener failed:', error);
    }
  });
};

const buildEvent = (type, payload) => ({
  id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `runtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  type,
  payload,
  createdAt: Date.now()
});

const ensureBroadcastChannel = () => {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }

  if (!broadcastChannel) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = (event) => {
      if (event?.data?.type) {
        emitToListeners(event.data);
      }
    };
  }

  return broadcastChannel;
};

const attachStorageListener = () => {
  if (storageListenerAttached || typeof window === 'undefined') {
    return;
  }

  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_EVENT_KEY || !event.newValue) {
      return;
    }

    try {
      const payload = JSON.parse(event.newValue);
      if (payload?.type) {
        emitToListeners(payload);
      }
    } catch (error) {
      console.error('Failed to parse runtime sync event:', error);
    }
  });

  storageListenerAttached = true;
};

const runtimeCoordinator = {
  publish(type, payload = {}) {
    if (typeof window === 'undefined') {
      return;
    }

    const event = buildEvent(type, payload);
    const channel = ensureBroadcastChannel();

    if (channel) {
      channel.postMessage(event);
      return;
    }

    try {
      window.localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(event));
      window.localStorage.removeItem(STORAGE_EVENT_KEY);
    } catch (error) {
      console.error('Failed to publish runtime sync event:', error);
    }
  },

  subscribe(listener) {
    ensureBroadcastChannel();
    attachStorageListener();
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }
};

export default runtimeCoordinator;
