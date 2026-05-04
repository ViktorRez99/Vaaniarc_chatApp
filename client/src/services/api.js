import { getCurrentDeviceSnapshot, getOrCreateDeviceId } from '../utils/device';

// API Service for authentication and chat functionality
const resolveApiBaseUrl = () => {
  const configuredBaseUrl = typeof import.meta.env.VITE_API_URL === 'string'
    ? import.meta.env.VITE_API_URL.trim()
    : '';

  if (!configuredBaseUrl) {
    return '/api';
  }

  return configuredBaseUrl.endsWith('/api')
    ? configuredBaseUrl
    : `${configuredBaseUrl.replace(/\/+$/, '')}/api`;
};

const API_BASE_URL = resolveApiBaseUrl();
const CSRF_COOKIE_NAME = 'vaaniarc_csrf';
const DEFAULT_CSRF_WAIT_TIMEOUT_MS = 3000;
const DEFAULT_CSRF_WAIT_INTERVAL_MS = 50;

const getCookieValue = (name) => {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookiePrefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((segment) => segment.trim())
    .find((segment) => segment.startsWith(cookiePrefix));

  return cookie ? decodeURIComponent(cookie.slice(cookiePrefix.length)) : null;
};

const createIdempotencyKey = (prefix = "mutation") => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
};

const createApiError = (message, context = {}) => {
  const error = new Error(message);
  error.name = 'ApiError';
  error.isApiError = true;
  Object.assign(error, context);
  return error;
};

class ApiService {
  constructor() {
    this.deviceId = getOrCreateDeviceId();
  }

  isFormDataBody(body) {
    return typeof FormData !== 'undefined' && body instanceof FormData;
  }

  // Set authorization header
  getHeaders(body = null, extraHeaders = {}, method = 'GET') {
    const headers = {
      ...extraHeaders,
    };

    if (!this.isFormDataBody(body) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    if (this.deviceId) {
      headers['X-Device-Id'] = this.deviceId;
    }

    const normalizedMethod = String(method || 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(normalizedMethod)) {
      const csrfToken = getCookieValue(CSRF_COOKIE_NAME);
      if (csrfToken) {
        headers['X-CSRF-Token'] = csrfToken;
      }
    }
    
    return headers;
  }

  // Set token
  setToken(token) {
    return token;
  }

  // Remove token
  removeToken() {
    return true;
  }

  getCurrentDeviceId() {
    if (!this.deviceId) {
      this.deviceId = getOrCreateDeviceId();
    }

    return this.deviceId;
  }

  getCsrfToken() {
    return getCookieValue(CSRF_COOKIE_NAME);
  }

  hasCsrfToken() {
    return Boolean(this.getCsrfToken());
  }

  async waitForCsrfCookie(timeoutMs = DEFAULT_CSRF_WAIT_TIMEOUT_MS, intervalMs = DEFAULT_CSRF_WAIT_INTERVAL_MS) {
    if (this.hasCsrfToken()) {
      return this.getCsrfToken();
    }

    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      await new Promise((resolve) => {
        window.setTimeout(resolve, intervalMs);
      });

      const csrfToken = this.getCsrfToken();
      if (csrfToken) {
        return csrfToken;
      }
    }

    throw createApiError('Your session is missing a CSRF token. Please refresh and sign in again.', {
      category: 'session',
      statusCode: 403,
      endpoint: '/auth/csrf'
    });
  }

  // Generic API call method
  async apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const { headers: extraHeaders = {}, body = null, ...restOptions } = options;
    const method = restOptions.method || 'GET';
    const config = {
      ...restOptions,
      body,
      credentials: 'include',
      headers: this.getHeaders(body, extraHeaders, method),
    };

    try {
      const response = await fetch(url, config);
      
      // Handle network errors
      if (!response) {
        throw createApiError('Unable to connect to server.', {
          category: 'network',
          endpoint,
          url
        });
      }

      // Get response text first to handle empty or non-JSON responses
      const responseText = await response.text();
      
      let data;
      try {
        // Try to parse as JSON
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        console.error('Failed to parse response:', responseText?.substring(0, 200));
        if (response.status >= 200 && response.status < 300) {
          return { success: true };
        }
        // If it looks like HTML (server error page), show a cleaner message
        if (responseText?.includes('<!DOCTYPE') || responseText?.includes('<html')) {
          throw createApiError('Server is not responding correctly. Please check if the backend is running.', {
            category: 'server',
            statusCode: response.status,
            endpoint,
            responseText
          });
        }
        throw createApiError('Server returned an invalid response format.', {
          category: 'server',
          statusCode: response.status,
          endpoint,
          responseText
        });
      }

      if (!response.ok) {
        const errorContext = {
          statusCode: response.status,
          endpoint,
          responseBody: data,
          responseText,
          url
        };

        // Handle specific error cases
        if (response.status === 401) {
          throw createApiError(
            data.message
            || (endpoint.includes('/auth/login') || endpoint.includes('/auth/register')
              ? 'Authentication failed.'
              : 'Session expired. Please sign in again.'),
            {
              ...errorContext,
              category: endpoint.includes('/auth/login') || endpoint.includes('/auth/register')
                ? 'auth'
                : 'session'
            }
          );
        }

        if (response.status === 403) {
          throw createApiError(data.message || 'Access denied.', {
            ...errorContext,
            category: /csrf/i.test(String(data?.message || '')) ? 'session' : 'auth'
          });
        }

        if (response.status === 404) {
          throw createApiError(data.message || 'Resource not found.', {
            ...errorContext,
            category: 'not_found'
          });
        }

        if (response.status === 409) {
          throw createApiError(data.message || 'That record already exists.', {
            ...errorContext,
            category: 'conflict'
          });
        }

        if (response.status === 503) {
          throw createApiError(
            data.message || 'Server is still starting up. Please try again in a moment.',
            {
              ...errorContext,
              category: data?.mongodb ? 'database' : 'server'
            }
          );
        }

        if (response.status >= 500) {
          throw createApiError(data.message || 'Server error. Please try again later.', {
            ...errorContext,
            category: 'server'
          });
        }

        throw createApiError(data.message || `HTTP error ${response.status}`, {
          ...errorContext,
          category: 'request'
        });
      }

      return data;
    } catch (error) {
      if (!error?.isApiError) {
        console.error('API Error:', error);
      }
      
      // Handle network connection errors
      if (error?.message?.includes('Failed to fetch') || error?.message?.includes('NetworkError')) {
        throw createApiError('Unable to connect to server. Please check the backend connection.', {
          endpoint,
          url,
          category: 'network'
        });
      }
      
      throw error;
    }
  }

  // Authentication methods
  async register(userData) {
    return this.apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async login(credentials) {
    return this.apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
  }

  async logout() {
    return this.apiCall('/auth/logout', {
      method: 'POST',
    });
  }

  async getProfile() {
    return this.apiCall('/auth/profile');
  }

  async updateProfile(profileData) {
    return this.apiCall('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(profileData),
    });
  }

  async changePassword(passwordData) {
    return this.apiCall('/auth/change-password', {
      method: 'PUT',
      body: JSON.stringify(passwordData),
    });
  }

  async getTwoFactorStatus() {
    return this.apiCall('/2fa/status');
  }

  async getWebAuthnRegistrationOptions(payload = {}) {
    return this.apiCall('/auth/webauthn/register/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async verifyWebAuthnRegistration(payload) {
    return this.apiCall('/auth/webauthn/register/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getWebAuthnAuthenticationOptions(payload = {}) {
    return this.apiCall('/auth/webauthn/authenticate/options', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async verifyWebAuthnAuthentication(payload) {
    return this.apiCall('/auth/webauthn/authenticate/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async listPasskeys() {
    return this.apiCall('/auth/webauthn/credentials');
  }

  async revokePasskey(passkeyId) {
    return this.apiCall(`/auth/webauthn/credentials/${passkeyId}`, {
      method: 'DELETE',
    });
  }

  async listRecoveryKits() {
    return this.apiCall('/auth/recovery/kits');
  }

  async createRecoveryKit(payload) {
    return this.apiCall('/auth/recovery/kits', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async rotateRecoveryKit(kitId, payload) {
    return this.apiCall(`/auth/recovery/kits/${kitId}/rotate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async revokeRecoveryKit(kitId) {
    return this.apiCall(`/auth/recovery/kits/${kitId}`, {
      method: 'DELETE',
    });
  }

  async getReceivedRecoveryShares() {
    return this.apiCall('/auth/recovery/received');
  }

  async setupTwoFactor() {
    return this.apiCall('/2fa/setup', {
      method: 'POST',
    });
  }

  async enableTwoFactor(payload) {
    return this.apiCall('/2fa/enable', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async disableTwoFactor(payload) {
    return this.apiCall('/2fa/disable', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async searchUsers(query) {
    return this.apiCall(`/auth/users/search?q=${encodeURIComponent(query)}`);
  }

  // Private Chat methods
  async getChats() {
    return this.apiCall('/chats');
  }

  async createOrGetChat(recipientId) {
    return this.apiCall('/chats', {
      method: 'POST',
      body: JSON.stringify({ recipientId }),
    });
  }

  async getChatMessages(chatId, limit = 50, before = null) {
    const url = before 
      ? `/chats/${chatId}/messages?limit=${limit}&before=${before}`
      : `/chats/${chatId}/messages?limit=${limit}`;
    return this.apiCall(url);
  }

  async getPinnedChatMessages(chatId) {
    return this.apiCall(`/chats/${chatId}/messages/pinned`);
  }

  async sendChatMessage(chatId, messageData) {
    return this.apiCall(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  async consumeViewOnceChatMessage(chatId, messageId) {
    return this.apiCall(`/chats/${chatId}/messages/${messageId}/consume-view-once`, {
      method: 'POST',
    });
  }

  async markChatMessagesRead(chatId) {
    return this.apiCall(`/chats/${chatId}/messages/read`, {
      method: 'PATCH',
    });
  }

  async updateChatMessagePin(messageId, isPinned) {
    return this.apiCall(`/chat/messages/${messageId}/pin`, {
      method: 'PATCH',
      headers: {
        'X-Idempotency-Key': createIdempotencyKey('message-pin')
      },
      body: JSON.stringify({ isPinned }),
    });
  }

  async getUsers(search = '') {
    const url = search ? `/users?search=${encodeURIComponent(search)}` : '/users';
    return this.apiCall(url);
  }

  async getUserDetails(userId) {
    return this.apiCall(`/users/${userId}`);
  }

  // Room/Group Chat methods
  async getRooms(type = null) {
    const url = type ? `/rooms?type=${type}` : '/rooms';
    return this.apiCall(url);
  }

  async getPublicRooms(search = '', limit = 20) {
    const url = search 
      ? `/rooms/public?search=${encodeURIComponent(search)}&limit=${limit}`
      : `/rooms/public?limit=${limit}`;
    return this.apiCall(url);
  }

  async createRoom(roomData) {
    return this.apiCall('/rooms', {
      method: 'POST',
      body: JSON.stringify(roomData),
    });
  }

  async getRoomDetails(roomId) {
    return this.apiCall(`/rooms/${roomId}`);
  }

  async updateRoom(roomId, roomData) {
    return this.apiCall(`/rooms/${roomId}`, {
      method: 'PATCH',
      body: JSON.stringify(roomData),
    });
  }

  async joinRoom(roomId) {
    return this.apiCall(`/rooms/${roomId}/join`, {
      method: 'POST',
    });
  }

  async leaveRoom(roomId) {
    return this.apiCall(`/rooms/${roomId}/leave`, {
      method: 'POST',
    });
  }

  async addRoomMember(roomId, userId, role = 'member') {
    return this.apiCall(`/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, role }),
    });
  }

  async removeRoomMember(roomId, userId) {
    return this.apiCall(`/rooms/${roomId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  async updateMemberRole(roomId, userId, role) {
    return this.apiCall(`/rooms/${roomId}/members/${userId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async getRoomMessages(roomId, limit = 50, before = null) {
    const url = before 
      ? `/rooms/${roomId}/messages?limit=${limit}&before=${before}`
      : `/rooms/${roomId}/messages?limit=${limit}`;
    return this.apiCall(url);
  }

  async getPinnedRoomMessages(roomId) {
    return this.apiCall(`/rooms/${roomId}/messages/pinned`);
  }

  async sendRoomMessage(roomId, messageData) {
    return this.apiCall(`/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  async consumeViewOnceRoomMessage(roomId, messageId) {
    return this.apiCall(`/rooms/${roomId}/messages/${messageId}/consume-view-once`, {
      method: 'POST',
    });
  }

  async deleteRoom(roomId) {
    return this.apiCall(`/rooms/${roomId}`, {
      method: 'DELETE',
    });
  }

  async getRoomStats(roomId) {
    return this.apiCall(`/rooms/${roomId}/stats`);
  }

  async updateRoomMessagePin(roomId, messageId, isPinned) {
    return this.apiCall(`/rooms/${roomId}/messages/${messageId}/pin`, {
      method: 'PATCH',
      body: JSON.stringify({ isPinned }),
    });
  }

  async getDevices() {
    return this.apiCall('/devices');
  }

  async registerDeviceKeyBundle(payload) {
    return this.apiCall('/keys/devices/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getUserDeviceBundles(userId) {
    return this.apiCall(`/keys/devices/${userId}`);
  }

  async getKeyTransparencyLog(userId) {
    return this.apiCall(`/keys/transparency/${userId}`);
  }

  async consumeUserDevicePrekey(userId, deviceId) {
    return this.apiCall('/keys/devices/consume-prekey', {
      method: 'POST',
      body: JSON.stringify({ userId, deviceId }),
    });
  }

  async registerCurrentDevice(identityState = null) {
    const snapshot = getCurrentDeviceSnapshot();
    return this.apiCall('/devices', {
      method: 'POST',
      body: JSON.stringify({
        ...snapshot,
        publicKeyFingerprint: identityState?.fingerprint || identityState?.serverFingerprint || null,
        identityStatus: identityState?.status || 'unknown'
      })
    });
  }

  async updateCurrentDeviceActivity() {
    const deviceId = this.getCurrentDeviceId();

    if (!deviceId) {
      return { skipped: true };
    }

    return this.apiCall(`/devices/${deviceId}/activity`, {
      method: 'POST',
    });
  }

  async updateDevice(deviceId, payload) {
    return this.apiCall(`/devices/${deviceId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  async revokeDevice(deviceId) {
    return this.apiCall(`/devices/${deviceId}`, {
      method: 'DELETE',
    });
  }

  async getNotificationConfig() {
    return this.apiCall('/notifications/config');
  }

  async subscribePushSubscription(subscription) {
    return this.apiCall('/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription }),
    });
  }

  async unsubscribePushSubscription() {
    return this.apiCall('/notifications/subscribe', {
      method: 'DELETE',
    });
  }

  async getConversations() {
    return this.apiCall('/conversations');
  }

  async createConversation(payload) {
    return this.apiCall('/conversations', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getConversationMessages(conversationId, limit = 50, before = null) {
    const query = before
      ? `/conversations/${conversationId}/messages?limit=${limit}&before=${before}`
      : `/conversations/${conversationId}/messages?limit=${limit}`;

    return this.apiCall(query);
  }

  async getChannels(search = '') {
    const query = search ? `/channels?search=${encodeURIComponent(search)}` : '/channels';
    return this.apiCall(query);
  }

  async getDiscoverChannels(search = '', limit = 20) {
    const query = search
      ? `/channels/discover?search=${encodeURIComponent(search)}&limit=${limit}`
      : `/channels/discover?limit=${limit}`;
    return this.apiCall(query);
  }

  async createChannel(channelData) {
    return this.apiCall('/channels', {
      method: 'POST',
      body: JSON.stringify(channelData),
    });
  }

  async joinChannel(channelId) {
    return this.apiCall(`/channels/${channelId}/join`, {
      method: 'POST',
    });
  }

  async getChannelPosts(channelId, limit = 50, before = null) {
    const query = before
      ? `/channels/${channelId}/posts?limit=${limit}&before=${before}`
      : `/channels/${channelId}/posts?limit=${limit}`;
    return this.apiCall(query);
  }

  async createChannelPost(channelId, payload) {
    return this.apiCall(`/channels/${channelId}/posts`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getCommunities(search = '') {
    const query = search ? `/communities?search=${encodeURIComponent(search)}` : '/communities';
    return this.apiCall(query);
  }

  async getDiscoverCommunities(search = '', limit = 20) {
    const query = search
      ? `/communities/discover?search=${encodeURIComponent(search)}&limit=${limit}`
      : `/communities/discover?limit=${limit}`;
    return this.apiCall(query);
  }

  async createCommunity(payload) {
    return this.apiCall('/communities', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async joinCommunity(communityId) {
    return this.apiCall(`/communities/${communityId}/join`, {
      method: 'POST',
    });
  }

  async addReaction(messageId, emoji) {
    return this.apiCall(`/chat/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'X-Idempotency-Key': createIdempotencyKey('reaction-add')
      },
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(messageId, emoji) {
    return this.apiCall(`/chat/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`, {
      method: 'DELETE',
      headers: {
        'X-Idempotency-Key': createIdempotencyKey('reaction-remove')
      },
    });
  }

  async editMessage(messageId, content, expectedUpdatedAt = null) {
    return this.apiCall(`/chat/messages/${messageId}`, {
      method: 'PUT',
      headers: {
        'X-Idempotency-Key': createIdempotencyKey('message-edit')
      },
      body: JSON.stringify({ content, expectedUpdatedAt }),
    });
  }

  async deleteMessage(messageId) {
    return this.apiCall(`/chat/messages/${messageId}`, {
      method: 'DELETE',
      headers: {
        'X-Idempotency-Key': createIdempotencyKey('message-delete')
      },
    });
  }

  // File upload methods
  async uploadFile(file, roomId = null) {
    const formData = new FormData();
    formData.append('file', file);
    
    if (roomId) {
      formData.append('roomId', roomId);
    }

    return this.apiCall('/upload/file', {
      method: 'POST',
      body: formData,
    });
  }

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);

    return this.apiCall('/upload/avatar', {
      method: 'POST',
      body: formData,
    });
  }

  // Verify token
  async verifyToken() {
    return this.apiCall('/auth/verify');
  }

  async getHealthStatus() {
    return this.apiCall('/health');
  }

  async getHealthReadiness() {
    return this.apiCall('/health/ready');
  }

  // Generic HTTP methods for flexibility
  async get(endpoint) {
    return this.apiCall(endpoint, {
      method: 'GET',
    });
  }

  async put(endpoint, data, options = {}) {
    const isFormData = this.isFormDataBody(data);
    return this.apiCall(endpoint, {
      ...options,
      method: 'PUT',
      body: isFormData ? data : JSON.stringify(data),
    });
  }

  async patch(endpoint, data, options = {}) {
    const isFormData = this.isFormDataBody(data);
    return this.apiCall(endpoint, {
      ...options,
      method: 'PATCH',
      body: isFormData ? data : JSON.stringify(data),
    });
  }

  async delete(endpoint, options = {}) {
    return this.apiCall(endpoint, {
      ...options,
      method: 'DELETE',
    });
  }

  async post(endpoint, data, options = {}) {
    const isFormData = this.isFormDataBody(data);
    return this.apiCall(endpoint, {
      ...options,
      method: 'POST',
      body: isFormData ? data : JSON.stringify(data),
    });
  }

  async uploadChatFile(chatId, file, options = {}) {
    const {
      tempId = null,
      encryptedFilePayload = null,
      expiresInSeconds = null,
      isViewOnce = false
    } = options;
    const formData = new FormData();
    formData.append('chatId', chatId);

    if (tempId) {
      formData.append('tempId', tempId);
    }

    if (encryptedFilePayload) {
      formData.append('encryptedFilePayload', encryptedFilePayload);
    }

    if (expiresInSeconds) {
      formData.append('expiresInSeconds', String(expiresInSeconds));
    }

    if (isViewOnce) {
      formData.append('isViewOnce', 'true');
    }

    formData.append('file', file);

    return this.apiCall('/upload/chat-file', {
      method: 'POST',
      body: formData,
    });
  }

  async uploadRoomFile(roomId, file, options = {}) {
    const {
      tempId = null,
      encryptedFilePayload = null,
      expiresInSeconds = null,
      isViewOnce = false
    } = options;
    const formData = new FormData();
    formData.append('roomId', roomId);

    if (tempId) {
      formData.append('tempId', tempId);
    }

    if (encryptedFilePayload) {
      formData.append('encryptedFilePayload', encryptedFilePayload);
    }

    if (expiresInSeconds) {
      formData.append('expiresInSeconds', String(expiresInSeconds));
    }

    if (isViewOnce) {
      formData.append('isViewOnce', 'true');
    }

    formData.append('file', file);

    return this.apiCall('/upload/file', {
      method: 'POST',
      body: formData,
    });
  }
}

export default new ApiService();
