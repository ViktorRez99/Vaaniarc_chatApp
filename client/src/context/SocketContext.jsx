import { createContext, useCallback, useContext, useMemo, useState } from 'react';

const EMPTY_SOCKET_CONTEXT = {
  notifications: [],
  unreadCounts: new Map(),
  addNotification: () => null,
  clearNotifications: () => null,
  markNotificationsRead: () => null
};

const SocketContext = createContext(EMPTY_SOCKET_CONTEXT);

export const SocketProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState(new Map());

  const addNotification = useCallback((notification = {}) => {
    const type = notification.type || 'general';
    const id = `notification-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      type,
      title: notification.title || 'VaaniArc',
      body: notification.body || '',
      timestamp: new Date().toISOString(),
      ...notification
    };

    setNotifications((currentValue) => [entry, ...currentValue].slice(0, 50));
    setUnreadCounts((currentValue) => {
      const nextValue = new Map(currentValue);
      nextValue.set(type, (nextValue.get(type) || 0) + 1);
      return nextValue;
    });

    return entry;
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCounts(new Map());
  }, []);

  const markNotificationsRead = useCallback(() => {
    setUnreadCounts(new Map());
  }, []);

  const contextValue = useMemo(() => ({
    notifications,
    unreadCounts,
    addNotification,
    clearNotifications,
    markNotificationsRead
  }), [addNotification, clearNotifications, markNotificationsRead, notifications, unreadCounts]);

  return (
    <SocketContext.Provider value={contextValue}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
