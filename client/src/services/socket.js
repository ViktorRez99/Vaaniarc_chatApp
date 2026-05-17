import { io } from 'socket.io-client';
import { decodeSocketPayload, encodeSocketPayload } from './socketPayloads';
const OFFLINE_QUEUE_STORAGE_KEY = 'vaaniarc_socket_offline_queue';
const MAX_OFFLINE_QUEUE_LENGTH = 100;
const MAX_QUEUE_ATTEMPTS = 5;
const QUEUEABLE_EVENTS = new Set(['private_message', 'room_message']);

const canUseStorage = () => typeof window !== 'undefined' && typeof localStorage !== 'undefined';

const createQueueEntryId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `queue-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.flushInProgress = false;
    this.onlineListenerAttached = false;
    this.listenerMap = new Map();
    this.status = 'idle';
    this.lastError = null;
    this.heartbeatInterval = null;
    this.statusListeners = new Set();
    this.handleBrowserOnline = this.handleBrowserOnline.bind(this);
    this.handleBrowserOffline = this.handleBrowserOffline.bind(this);
  }

  getSocketUrl() {
    const configuredSocketUrl = typeof import.meta.env.VITE_SOCKET_URL === 'string'
      ? import.meta.env.VITE_SOCKET_URL.trim()
      : '';
    return configuredSocketUrl || undefined;
  }

  getStatusSnapshot() {
    return {
      status: this.status,
      isConnected: this.isConnected,
      error: this.lastError
    };
  }

  notifyStatus(status, details = {}) {
    this.status = status;
    this.lastError = details.error || null;

    const snapshot = this.getStatusSnapshot();
    this.statusListeners.forEach((listener) => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('Socket status listener failed:', error);
      }
    });
  }

  subscribeStatus(listener) {
    this.statusListeners.add(listener);
    listener(this.getStatusSnapshot());

    return () => {
      this.statusListeners.delete(listener);
    };
  }

  attachRegisteredListeners() {
    if (!this.socket) {
      return;
    }

    this.listenerMap.forEach((wrappedCallbacks, event) => {
      wrappedCallbacks.forEach((wrappedCallback) => {
        this.socket.on(event, wrappedCallback);
      });
    });
  }

  attachSocketLifecycleListeners() {
    if (!this.socket) {
      return;
    }

    this.socket.on('connect', () => {
      this.isConnected = true;
      this.notifyStatus('connected');
      this.startHeartbeat();
      this.flushOfflineQueue();
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      this.stopHeartbeat();
      this.notifyStatus('disconnected', {
        error: reason && reason !== 'io client disconnect'
          ? new Error(`Realtime connection closed: ${reason}`)
          : null
      });
    });

    this.socket.on('connect_error', (error) => {
      console.warn('Socket connection error:', error);
      this.isConnected = false;
      this.notifyStatus('error', { error });
    });

    this.socket.on('message_sent', (payload) => {
      const decodedPayload = decodeSocketPayload(payload);
      this.acknowledgeQueuedMessage(decodedPayload?.tempId);
    });

    this.socket.on('room_message', (payload) => {
      const decodedPayload = decodeSocketPayload(payload);
      this.acknowledgeQueuedMessage(decodedPayload?.tempId);
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    if (!this.socket) {
      return;
    }

    this.socket.emit('heartbeat');
    const setTimer = typeof window !== 'undefined' ? window.setInterval : setInterval;
    this.heartbeatInterval = setTimer(() => {
      if (this.socket?.connected) {
        this.socket.emit('heartbeat');
      }
    }, 30000);
  }

  stopHeartbeat() {
    if (!this.heartbeatInterval) {
      return;
    }

    const clearTimer = typeof window !== 'undefined' ? window.clearInterval : clearInterval;
    clearTimer(this.heartbeatInterval);
    this.heartbeatInterval = null;
  }

  loadOfflineQueue() {
    if (!canUseStorage()) {
      return [];
    }

    try {
      const serializedQueue = localStorage.getItem(OFFLINE_QUEUE_STORAGE_KEY);
      const parsedQueue = serializedQueue ? JSON.parse(serializedQueue) : [];
      return Array.isArray(parsedQueue) ? parsedQueue : [];
    } catch (error) {
      console.error('Failed to read the offline socket queue:', error);
      return [];
    }
  }

  persistOfflineQueue(queue) {
    if (!canUseStorage()) {
      return;
    }

    try {
      localStorage.setItem(OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(queue));
    } catch (error) {
      console.error('Failed to persist the offline socket queue:', error);
    }
  }

  enqueueOfflineEvent(event, data) {
    const queue = this.loadOfflineQueue();
    const nextEntry = {
      id: createQueueEntryId(),
      event,
      data,
      attempts: 0,
      queuedAt: Date.now()
    };

    const nextQueue = [...queue, nextEntry].slice(-MAX_OFFLINE_QUEUE_LENGTH);
    this.persistOfflineQueue(nextQueue);
    return nextEntry;
  }

  acknowledgeQueuedMessage(tempId) {
    if (!tempId) {
      return;
    }

    const queue = this.loadOfflineQueue();
    const nextQueue = queue.filter((entry) => entry?.data?.tempId !== tempId);
    if (nextQueue.length !== queue.length) {
      this.persistOfflineQueue(nextQueue);
    }
  }

  async flushOfflineQueue() {
    if (!this.socket || !this.isConnected || this.flushInProgress) {
      return;
    }

    const queue = this.loadOfflineQueue();
    if (!queue.length) {
      return;
    }

    this.flushInProgress = true;

    try {
      const pendingQueue = [];

      queue.forEach((entry) => {
        if (!entry?.event || !entry?.data) {
          return;
        }

        if ((entry.attempts || 0) >= MAX_QUEUE_ATTEMPTS) {
          return;
        }

        this.socket.emit(entry.event, encodeSocketPayload(entry.event, entry.data));
        pendingQueue.push({
          ...entry,
          attempts: (entry.attempts || 0) + 1,
          lastAttemptAt: Date.now()
        });
      });

      this.persistOfflineQueue(pendingQueue);
    } finally {
      this.flushInProgress = false;
    }
  }

  attachBrowserListeners() {
    if (this.onlineListenerAttached || typeof window === 'undefined') {
      return;
    }

    window.addEventListener('online', this.handleBrowserOnline);
    window.addEventListener('offline', this.handleBrowserOffline);
    this.onlineListenerAttached = true;
  }

  detachBrowserListeners() {
    if (!this.onlineListenerAttached || typeof window === 'undefined') {
      return;
    }

    window.removeEventListener('online', this.handleBrowserOnline);
    window.removeEventListener('offline', this.handleBrowserOffline);
    this.onlineListenerAttached = false;
  }

  handleBrowserOnline() {
    if (this.socket && !this.isConnected) {
      this.notifyStatus('connecting');
      this.socket.connect();
    }

    this.flushOfflineQueue();
  }

  handleBrowserOffline() {
    this.isConnected = false;
    this.notifyStatus('disconnected', {
      error: new Error('The browser is offline.')
    });
  }

  connect(options = {}) {
    const {
      waitForConnection = false,
      timeoutMs = 8000
    } = options;

    if (!this.socket) {
      this.socket = io(this.getSocketUrl(), {
        autoConnect: false,
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        timeout: 10000,
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 12,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 15000,
        randomizationFactor: 0.5
      });
      this.attachSocketLifecycleListeners();
      this.attachRegisteredListeners();
    }

    this.attachBrowserListeners();

    if (this.socket.connected) {
      this.isConnected = true;
      this.notifyStatus('connected');
      return waitForConnection ? Promise.resolve(this.socket) : this.socket;
    }

    this.notifyStatus('connecting');
    this.socket.connect();

    if (!waitForConnection) {
      return this.socket;
    }

    return new Promise((resolve, reject) => {
      let timeoutId = null;
      const cleanup = () => {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        this.socket.off('connect', handleConnect);
        this.socket.off('connect_error', handleError);
      };

      const handleConnect = () => {
        cleanup();
        resolve(this.socket);
      };

      const handleError = (error) => {
        cleanup();
        reject(error instanceof Error ? error : new Error('Realtime connection failed.'));
      };

      timeoutId = typeof window !== 'undefined'
        ? window.setTimeout(() => {
          cleanup();
          reject(new Error('Realtime connection timed out.'));
        }, timeoutMs)
        : setTimeout(() => {
          cleanup();
          reject(new Error('Realtime connection timed out.'));
        }, timeoutMs);

      this.socket.once('connect', handleConnect);
      this.socket.once('connect_error', handleError);
    });
  }

  disconnect() {
    if (this.socket) {
      this.stopHeartbeat();
      this.socket.disconnect();
      this.socket = null;
    }

    this.detachBrowserListeners();
    this.isConnected = false;
    this.flushInProgress = false;
    this.notifyStatus('idle');
  }

  emit(event, data, options = {}) {
    const { queueIfDisconnected = false } = options;

    if (this.socket && this.isConnected) {
      this.socket.emit(event, encodeSocketPayload(event, data));
      return true;
    }

    if (queueIfDisconnected && QUEUEABLE_EVENTS.has(event)) {
      this.enqueueOfflineEvent(event, data);
      return false;
    }

    console.warn('Socket not connected, cannot emit:', event);
    return false;
  }

  on(event, callback) {
    if (!this.listenerMap.has(event)) {
      this.listenerMap.set(event, new Map());
    }

    if (this.listenerMap.get(event).has(callback)) {
      return;
    }

    const wrappedCallback = (payload, ...args) => callback(decodeSocketPayload(payload), ...args);
    this.listenerMap.get(event).set(callback, wrappedCallback);

    if (this.socket) {
      this.socket.on(event, wrappedCallback);
    }
  }

  off(event, callback) {
    const wrappedCallback = this.listenerMap.get(event)?.get(callback) || callback;

    if (this.socket) {
      this.socket.off(event, wrappedCallback);
    }

    if (this.listenerMap.get(event)?.get(callback) === wrappedCallback) {
      this.listenerMap.get(event).delete(callback);
      if (this.listenerMap.get(event).size === 0) {
        this.listenerMap.delete(event);
      }
    }
  }

  joinRoom(roomId) {
    this.emit('join_room', { roomId });
  }

  leaveRoom(roomId) {
    this.emit('leave_room', { roomId });
  }

  joinChannel(channelId) {
    this.emit('join_channel', { channelId });
  }

  leaveChannel(channelId) {
    this.emit('leave_channel', { channelId });
  }

  sendRoomMessage(roomId, content, messageType = 'text', replyTo = null, encryptedContent = null, tempId = null, expiresInSeconds = null) {
    this.emit('room_message', {
      roomId,
      content,
      messageType,
      replyTo,
      encryptedContent,
      tempId,
      expiresInSeconds
    }, { queueIfDisconnected: true });
  }

  sendPrivateMessage(chatId, content, messageType = 'text', fileUrl = null, encryptedContent = null, expiresInSeconds = null, tempId = null, replyTo = null) {
    this.emit('private_message', {
      chatId,
      content,
      messageType,
      fileUrl,
      encryptedContent,
      expiresInSeconds,
      tempId,
      replyTo
    }, { queueIfDisconnected: true });
  }

  reactToPrivateMessage(chatId, messageId, emoji) {
    this.emit('private_message_reaction', {
      chatId,
      messageId,
      emoji
    });
  }

  editPrivateMessage(chatId, messageId, content, expectedUpdatedAt = null) {
    this.emit('private_message_edit', {
      chatId,
      messageId,
      content,
      expectedUpdatedAt
    });
  }

  deletePrivateMessage(chatId, messageId) {
    this.emit('private_message_delete', {
      chatId,
      messageId
    });
  }

  startTyping(chatId) {
    this.emit('typing_start', { chatId });
  }

  stopTyping(chatId) {
    this.emit('typing_stop', { chatId });
  }

  startRoomTyping(roomId) {
    this.emit('room_typing_start', { roomId });
  }

  stopRoomTyping(roomId) {
    this.emit('room_typing_stop', { roomId });
  }

  markMessagesRead(chatId) {
    this.emit('mark_read', { chatId });
  }

  getOnlineUsers() {
    this.emit('get_online_users');
  }

  onRoomMessage(callback) {
    this.on('room_message', callback);
  }

  onPrivateMessage(callback) {
    this.on('private_message', callback);
  }

  onPrivateMessageReaction(callback) {
    this.on('private_message_reaction', callback);
  }

  onPrivateMessageEdit(callback) {
    this.on('private_message_edit', callback);
  }

  onPrivateMessageDelete(callback) {
    this.on('private_message_delete', callback);
  }

  onUserOnline(callback) {
    this.on('user_online', callback);
  }

  onUserOffline(callback) {
    this.on('user_offline', callback);
  }

  onUserJoinedRoom(callback) {
    this.on('user_joined_room', callback);
  }

  onUserLeftRoom(callback) {
    this.on('user_left_room', callback);
  }

  onUserTyping(callback) {
    this.on('user_typing', callback);
  }

  onUserStopTyping(callback) {
    this.on('user_stop_typing', callback);
  }

  onUserTypingRoom(callback) {
    this.on('user_typing_room', callback);
  }

  onUserStopTypingRoom(callback) {
    this.on('user_stop_typing_room', callback);
  }

  onChannelPost(callback) {
    this.on('channel_post', callback);
  }

  onMessagesRead(callback) {
    this.on('messages_read', callback);
  }

  onOnlineUsers(callback) {
    this.on('online_users', callback);
  }

  onError(callback) {
    this.on('error', callback);
  }
}

export default new SocketService();
