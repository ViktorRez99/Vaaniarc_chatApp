import api from './api';

const SERVICE_WORKER_URL = '/sw.js';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }

  return outputArray;
};

const supportsPushNotifications = () => (
  typeof window !== 'undefined'
  && 'serviceWorker' in navigator
  && 'PushManager' in window
  && 'Notification' in window
);

const registerServiceWorker = async () => {
  if (!supportsPushNotifications()) {
    return null;
  }

  const existingRegistration = await navigator.serviceWorker.getRegistration();
  if (existingRegistration) {
    return existingRegistration;
  }

  return navigator.serviceWorker.register(SERVICE_WORKER_URL);
};

const getExistingSubscription = async () => {
  const registration = await registerServiceWorker();
  if (!registration) {
    return null;
  }

  return registration.pushManager.getSubscription();
};

const getPushStatus = async () => {
  if (!supportsPushNotifications()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      serverConfigured: false
    };
  }

  let serverConfigured = false;
  try {
    const config = await api.getNotificationConfig();
    serverConfigured = Boolean(config?.supported && config?.vapidPublicKey);
  } catch {
    serverConfigured = false;
  }

  const subscription = await getExistingSubscription();

  return {
    supported: true,
    enabled: Boolean(subscription && Notification.permission === 'granted'),
    permission: Notification.permission,
    serverConfigured,
    subscription
  };
};

const syncPushSubscription = async ({ requestPermission = false } = {}) => {
  if (!supportsPushNotifications()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      serverConfigured: false
    };
  }

  const config = await api.getNotificationConfig();
  const serverConfigured = Boolean(config?.supported && config?.vapidPublicKey);
  if (!serverConfigured) {
    return {
      supported: true,
      enabled: false,
      permission: Notification.permission,
      serverConfigured: false
    };
  }

  let permission = Notification.permission;
  if (permission === 'default' && requestPermission) {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') {
    return {
      supported: true,
      enabled: false,
      permission,
      serverConfigured
    };
  }

  const registration = await registerServiceWorker();
  if (!registration) {
    return {
      supported: false,
      enabled: false,
      permission,
      serverConfigured
    };
  }

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.vapidPublicKey)
    });
  }

  const serializedSubscription = subscription.toJSON ? subscription.toJSON() : subscription;
  await api.subscribePushSubscription(serializedSubscription);

  return {
    supported: true,
    enabled: true,
    permission,
    serverConfigured,
    subscription
  };
};

const disablePushNotifications = async () => {
  if (!supportsPushNotifications()) {
    return {
      supported: false,
      enabled: false,
      permission: 'unsupported',
      serverConfigured: false
    };
  }

  const subscription = await getExistingSubscription();
  if (subscription) {
    await subscription.unsubscribe();
  }

  try {
    await api.unsubscribePushSubscription();
  } catch (error) {
    console.error('Failed to clear push subscription on the server:', error);
  }

  return {
    supported: true,
    enabled: false,
    permission: Notification.permission,
    serverConfigured: true
  };
};

const clearServerPushSubscription = async () => {
  if (!supportsPushNotifications()) {
    return;
  }

  try {
    await api.unsubscribePushSubscription();
  } catch (error) {
    console.error('Failed to remove server push subscription:', error);
  }
};

export {
  clearServerPushSubscription,
  disablePushNotifications,
  getPushStatus,
  registerServiceWorker,
  supportsPushNotifications,
  syncPushSubscription
};
