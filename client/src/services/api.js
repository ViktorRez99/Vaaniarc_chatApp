// API Service for authentication and chat functionality
const API_BASE_URL = '/api';

class ApiService {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  // Set authorization header
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    
    return headers;
  }

  // Set token
  setToken(token) {
    this.token = token;
    localStorage.setItem('token', token);
  }

  // Remove token
  removeToken() {
    this.token = null;
    localStorage.removeItem('token');
  }

  // Generic API call method
  async apiCall(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const config = {
      headers: this.getHeaders(),
      ...options,
    };

    try {
      const response = await fetch(url, config);
      
      // Handle network errors
      if (!response) {
        throw new Error('Network error: Unable to connect to server');
      }

      let data;
      try {
        data = await response.json();
      } catch (parseError) {
        if (response.status >= 200 && response.status < 300) {
          return { success: true };
        }
        throw new Error('Server error: Invalid response format');
      }

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          // Only remove token if we have one (session expired)
          // Don't remove token on login/register failures
          if (this.token && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
            this.removeToken();
            throw new Error('Session expired. Please login again.');
          }
          throw new Error(data.message || 'Authentication failed.');
        } else if (response.status === 403) {
          throw new Error('Access denied.');
        } else if (response.status === 404) {
          throw new Error('Resource not found.');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error(data.message || `HTTP error ${response.status}`);
      }

      return data;
    } catch (error) {
      console.error('API Error:', error);
      
      // Handle network connection errors
      if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
        throw new Error('Unable to connect to server. Please check your internet connection.');
      }
      
      throw error;
    }
  }

  // Authentication methods
  async register(userData) {
    const response = await this.apiCall('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
    
    if (response.token) {
      this.setToken(response.token);
    }
    
    return response;
  }

  async login(credentials) {
    const response = await this.apiCall('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    
    if (response.token) {
      this.setToken(response.token);
    }
    
    return response;
  }

  async logout() {
    try {
      await this.apiCall('/auth/logout', {
        method: 'POST',
      });
    } finally {
      this.removeToken();
    }
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

  async sendChatMessage(chatId, messageData) {
    return this.apiCall(`/chats/${chatId}/messages`, {
      method: 'POST',
      body: JSON.stringify(messageData),
    });
  }

  async markChatMessagesRead(chatId) {
    return this.apiCall(`/chats/${chatId}/messages/read`, {
      method: 'PATCH',
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

  async sendRoomMessage(roomId, messageData) {
    return this.apiCall(`/rooms/${roomId}/messages`, {
      method: 'POST',
      body: JSON.stringify(messageData),
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

  async addReaction(messageId, emoji) {
    return this.apiCall(`/chat/messages/${messageId}/reactions`, {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    });
  }

  async removeReaction(messageId, emoji) {
    return this.apiCall(`/chat/messages/${messageId}/reactions/${emoji}`, {
      method: 'DELETE',
    });
  }

  async editMessage(messageId, content) {
    return this.apiCall(`/chat/messages/${messageId}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  async deleteMessage(messageId) {
    return this.apiCall(`/chat/messages/${messageId}`, {
      method: 'DELETE',
    });
  }

  // File upload methods
  async uploadFile(file, roomId = null, recipientId = null) {
    const formData = new FormData();
    formData.append('file', file);
    
    if (roomId) {
      formData.append('roomId', roomId);
    }
    
    if (recipientId) {
      formData.append('recipientId', recipientId);
    }

    const response = await fetch('/api/upload/file', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'File upload failed');
    }

    return response.json();
  }

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await fetch('/api/upload/avatar', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Avatar upload failed');
    }

    return response.json();
  }

  // Verify token
  async verifyToken() {
    try {
      return await this.apiCall('/auth/verify');
    } catch (error) {
      this.removeToken();
      throw error;
    }
  }

  // Generic HTTP methods for flexibility
  async get(endpoint) {
    return this.apiCall(endpoint, {
      method: 'GET',
    });
  }

  async post(endpoint, data) {
    return this.apiCall(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async put(endpoint, data) {
    return this.apiCall(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async patch(endpoint, data) {
    return this.apiCall(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async delete(endpoint) {
    return this.apiCall(endpoint, {
      method: 'DELETE',
    });
  }
}

export default new ApiService();
