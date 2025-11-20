import { useState, useEffect, useRef } from 'react';
import { 
  Search, Plus, Send, Paperclip, Smile, MoreVertical, 
  Phone, Video, Info, ArrowLeft, Check, CheckCheck,
  Image as ImageIcon, File, Mic, X, MessageCircle, Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import api from '../services/api';
import UserProfile from './UserProfile';

const ChatsPage = () => {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [showUserList, setShowUserList] = useState(false);
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    fetchChats();
    setupSocketListeners();
    
    return () => {
      cleanupSocketListeners();
    };
  }, []);

  // Search users with debouncing
  useEffect(() => {
    const searchUsers = async () => {
      if (searchQuery.trim().length > 0) {
        setIsSearching(true);
        try {
          const response = await api.get(`/users?search=${searchQuery}`);
          setSearchResults(response || []);
        } catch (error) {
          console.error('Error searching users:', error);
          setSearchResults([]);
        } finally {
          setIsSearching(false);
        }
      } else {
        setSearchResults([]);
      }
    };

    const debounceTimer = setTimeout(searchUsers, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  useEffect(() => {
    if (selectedChat) {
      fetchMessages(selectedChat._id);
      markMessagesAsRead(selectedChat._id);
    }
  }, [selectedChat]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchChats = async () => {
    try {
      const response = await api.get('/chats');
      setChats(Array.isArray(response) ? response : (response?.data || []));
    } catch (error) {
      console.error('Error fetching chats:', error);
      setChats([]);
    }
  };

  const fetchMessages = async (chatId) => {
    try {
      const response = await api.get(`/chats/${chatId}/messages`);
      setMessages(Array.isArray(response) ? response : (response?.data || []));
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]);
    }
  };

  const markMessagesAsRead = async (chatId) => {
    try {
      await api.patch(`/chats/${chatId}/messages/read`);
      socketService.emit('mark_read', { chatId });
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const setupSocketListeners = () => {
    socketService.on('private_message', handleNewMessage);
    socketService.on('user_typing', handleUserTyping);
    socketService.on('user_stop_typing', handleUserStopTyping);
    socketService.on('messages_read', handleMessagesRead);
  };

  const cleanupSocketListeners = () => {
    socketService.off('private_message', handleNewMessage);
    socketService.off('user_typing', handleUserTyping);
    socketService.off('user_stop_typing', handleUserStopTyping);
    socketService.off('messages_read', handleMessagesRead);
  };

  const handleNewMessage = (message) => {
    if (selectedChat && message.chatId === selectedChat._id) {
      setMessages(prev => [...prev, message]);
      markMessagesAsRead(selectedChat._id);
    }
    
    // Update chat list
    setChats(prev => {
      const updated = prev.map(chat => 
        chat._id === message.chatId 
          ? { ...chat, lastMessage: message, updatedAt: new Date() }
          : chat
      );
      return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  };

  const handleUserTyping = ({ chatId, userId, username }) => {
    if (selectedChat && chatId === selectedChat._id) {
      setTypingUsers(prev => new Set([...prev, username]));
    }
  };

  const handleUserStopTyping = ({ chatId, userId }) => {
    if (selectedChat && chatId === selectedChat._id) {
      setTypingUsers(prev => {
        const updated = new Set(prev);
        // Remove by matching user
        const chat = chats.find(c => c._id === chatId);
        const typingUser = chat?.participants.find(p => p._id === userId);
        if (typingUser) {
          updated.delete(typingUser.username);
        }
        return updated;
      });
    }
  };

  const handleMessagesRead = ({ chatId, readBy }) => {
    if (selectedChat && chatId === selectedChat._id) {
      setMessages(prev => prev.map(msg => 
        msg.sender._id === user._id ? { ...msg, read: true, readAt: new Date() } : msg
      ));
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!messageInput.trim() || !selectedChat) return;

    try {
      const content = messageInput.trim();
      setMessageInput('');
      
      // Stop typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socketService.emit('typing_stop', { chatId: selectedChat._id });

      // Send via socket for real-time delivery
      socketService.emit('private_message', {
        chatId: selectedChat._id,
        content,
        messageType: 'text'
      });
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);

    if (!selectedChat) return;

    // Send typing indicator
    if (!isTyping) {
      setIsTyping(true);
      socketService.emit('typing_start', { chatId: selectedChat._id });
    }

    // Clear previous timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socketService.emit('typing_stop', { chatId: selectedChat._id });
    }, 2000);
  };

  const fetchUsers = async (search = '') => {
    try {
      const response = await api.get(`/users?search=${search}`);
      setUsers(response || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    }
  };

  const handleStartChat = async (recipientId) => {
    try {
      const response = await api.post('/chats', { recipientId });
      const chat = response?.data || response;
      
      // If chat doesn't have populated participants, fetch user details
      if (!chat?.participants || chat.participants.length === 0) {
        try {
          const userResponse = await api.get(`/users/${recipientId}`);
          const recipientUser = userResponse?.data || userResponse;
          if (recipientUser) {
            setSelectedUser(recipientUser);
          }
        } catch (err) {
          console.error('Error fetching recipient details:', err);
        }
      }
      
      setSelectedChat(chat);
      setShowUserList(false);
      setShowProfile(false);
      fetchChats();
    } catch (error) {
      console.error('Error starting chat:', error);
    }
  };

  const getOtherParticipant = (chat) => {
    if (!chat?.participants || !Array.isArray(chat.participants)) {
      // If participants aren't loaded, use selectedUser as fallback
      return selectedUser;
    }
    const otherParticipant = chat.participants.find(p => {
      // Handle both populated and non-populated participant IDs
      const participantId = typeof p === 'object' ? p._id : p;
      return participantId !== user?._id;
    });
    return otherParticipant || selectedUser;
  };

  const formatTime = (date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now - d;
    
    if (diff < 86400000) { // Less than 24 hours
      return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) { // Less than 7 days
      return d.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-[#0b141a] overflow-hidden">
      {/* Chat List Sidebar - WhatsApp Style */}
      <div className={`w-full md:w-80 lg:w-96 border-r border-[#2a2f32] flex flex-col bg-[#111b21] flex-shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
        {/* Search Header */}
        <div className="p-3 md:p-4 border-b border-white/10">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#8696a0]" />
            <input
              type="text"
              placeholder="Search or start new chat"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-[#202c33] border-none rounded-lg text-[#e9edef] placeholder-[#8696a0] focus:outline-none"
            />
          </div>
          <button
            onClick={() => {
              setShowUserList(!showUserList);
              if (!showUserList) fetchUsers();
            }}
            className="mt-3 w-full flex items-center justify-center space-x-2 px-4 py-3 bg-emerald-500/20 backdrop-blur-md border border-emerald-500/30 rounded-2xl hover:bg-emerald-500/30 transition-all shadow-lg group"
          >
            <div className="p-1 rounded-full bg-emerald-500/20 group-hover:bg-emerald-500/40 transition-colors">
              <Plus className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="font-medium text-emerald-100">New Chat</span>
          </button>
        </div>

        {/* User List for New Chat */}
        {showUserList && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-2">
              <div className="flex items-center justify-between px-3 py-2">
                <h3 className="font-semibold text-[#e9edef]">Select a contact</h3>
                <button onClick={() => setShowUserList(false)} className="text-white/60 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {(users || []).map((u) => (
                <div
                  key={u._id}
                  className="w-full flex items-center space-x-3 p-3 hover:bg-[#202c33] rounded-lg transition-all group"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-semibold">{u.username[0].toUpperCase()}</span>
                      )}
                    </div>
                    {u.status === 'online' && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-[#e9edef]">{u.username}</p>
                    <p className="text-sm text-[#8696a0] truncate">{u.bio || 'Hey there! I am using VaaniArc'}</p>
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        setShowProfile(true);
                        setShowUserList(false);
                      }}
                      className="p-2 bg-[#2a3942] hover:bg-[#374248] rounded-full transition-colors"
                      title="View profile"
                    >
                      <Info className="w-4 h-4 text-[#00a884]" />
                    </button>
                    <button
                      onClick={() => handleStartChat(u._id)}
                      className="p-2 bg-[#00a884] hover:bg-[#06cf9c] rounded-full transition-colors"
                      title="Start chat"
                    >
                      <MessageCircle className="w-4 h-4 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search Results or Chat List */}
        {!showUserList && searchQuery.trim().length > 0 ? (
          searchResults.length > 0 ? (
            /* Search Results */
            <div className="flex-1 overflow-y-auto">
              <div className="p-2">
                <div className="px-3 py-2 text-xs text-[#8696a0] uppercase tracking-wider">Search Results ({searchResults.length})</div>
                {searchResults.map((u) => (
                <button
                  key={u._id}
                  onClick={() => {
                    setSelectedUser(u);
                    setShowProfile(true);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center space-x-3 p-3 hover:bg-[#202c33] rounded-lg transition-all group cursor-pointer focus:outline-none"
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#00a884] to-[#005c4b] flex items-center justify-center">
                      {u.avatar ? (
                        <img src={u.avatar} alt={u.username} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-semibold text-white">{u.username[0].toUpperCase()}</span>
                      )}
                    </div>
                    {u.status === 'online' && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-[#111b21]"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-[#e9edef]">{u.username}</p>
                    <p className="text-sm text-[#8696a0] truncate">{u.bio || 'Hey there! I am using VaaniArc'}</p>
                  </div>
                  <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div
                      className="p-2 bg-[#00a884]/20 rounded-full"
                      title="Click to view profile"
                    >
                      <Info className="w-4 h-4 text-[#00a884]" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          ) : isSearching ? (
            /* Loading state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#00a884] mx-auto mb-3"></div>
                <p className="text-[#8696a0]">Searching...</p>
              </div>
            </div>
          ) : (
            /* No results */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-8 px-4">
                <Search className="w-16 h-16 text-[#8696a0] mx-auto mb-3 opacity-50" />
                <p className="text-[#e9edef] font-medium mb-1">No users found</p>
                <p className="text-sm text-[#8696a0]">Try searching with a different username</p>
              </div>
            </div>
          )
        ) : !showUserList ? (
          /* Chat List */
          <div className="flex-1 overflow-y-auto">
            {(chats || []).filter(chat => {
              const other = getOtherParticipant(chat);
              return other?.username.toLowerCase().includes(searchQuery.toLowerCase());
            }).map((chat) => {
              const otherUser = getOtherParticipant(chat);
              const isSelected = selectedChat?._id === chat._id;
              // Handle both populated and non-populated sender in lastMessage
              const lastMessageSenderId = typeof chat.lastMessage?.sender === 'object' 
                ? chat.lastMessage?.sender?._id 
                : chat.lastMessage?.sender;
              const hasUnread = chat.lastMessage && lastMessageSenderId !== user._id && !chat.lastMessage.read;

              return (
                <button
                  key={chat._id}
                  onClick={() => setSelectedChat(chat)}
                  className={`w-full flex items-center space-x-3 p-3 border-b border-[#2a2f32] transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-[#2a3942]' 
                      : 'hover:bg-[#202c33]'
                  }`}
                >
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
                      {otherUser?.avatar ? (
                        <img src={otherUser.avatar} alt={otherUser.username} className="w-full h-full rounded-full object-cover" />
                      ) : (
                        <span className="text-lg font-semibold">{otherUser?.username[0].toUpperCase()}</span>
                      )}
                    </div>
                    {otherUser?.status === 'online' && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="flex items-center justify-between mb-1">
                      <p className={`font-medium truncate ${hasUnread ? 'text-[#e9edef]' : 'text-[#e9edef]'}`}>
                        {otherUser?.username}
                      </p>
                      {chat.lastMessage && (
                        <span className="text-xs text-[#8696a0]">{formatTime(chat.updatedAt)}</span>
                      )}
                    </div>
                    {chat.lastMessage && (
                      <div className="flex items-center space-x-1">
                        {lastMessageSenderId === user._id && (
                          chat.lastMessage.read ? (
                            <CheckCheck className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Check className="w-4 h-4 text-white/40" />
                          )
                        )}
                        <p className={`text-sm truncate ${hasUnread ? 'text-[#e9edef] font-medium' : 'text-[#8696a0]'}`}>
                          {chat.lastMessage.content}
                        </p>
                      </div>
                    )}
                  </div>
                  {hasUnread && (
                    <div className="w-5 h-5 bg-[#00a884] rounded-full flex items-center justify-center text-xs font-bold text-[#111b21]">
                      1
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-[#0b141a]">
          {/* Chat Header - Glassy & Floating */}
          <div className="absolute top-0 left-0 right-0 z-20 h-16 px-4 flex items-center justify-between border-b border-white/5 bg-slate-900/20 backdrop-blur-2xl shadow-sm">          
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setSelectedChat(null)}
                className="md:hidden p-2 hover:bg-white/10 rounded-full transition-colors text-slate-200"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setSelectedUser(getOtherParticipant(selectedChat));
                  setShowProfile(true);
                }}
                className="relative flex-shrink-0 bg-gradient-to-br from-indigo-500 to-violet-500 w-10 h-10 rounded-full focus:outline-none focus:ring-2 focus:ring-white/20 flex items-center justify-center shadow-lg"
                title="View profile"
              >
                {getOtherParticipant(selectedChat)?.avatar ? (
                  <img
                    src={getOtherParticipant(selectedChat).avatar}
                    alt={getOtherParticipant(selectedChat)?.username || 'User'}
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  <span className="text-sm font-bold text-white">
                    {getOtherParticipant(selectedChat)?.username?.[0]?.toUpperCase() || 'U'}
                  </span>
                )}
                {getOtherParticipant(selectedChat)?.status === 'online' && (
                  <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-slate-900 shadow-sm"></div>
                )}
              </button>
              <div className="cursor-pointer" onClick={() => {
                  setSelectedUser(getOtherParticipant(selectedChat));
                  setShowProfile(true);
                }}>
                <p className="font-semibold text-white text-sm md:text-base">{getOtherParticipant(selectedChat)?.username || 'User'}</p>
                <p className="text-xs text-slate-400 font-medium">
                  {typingUsers.size > 0 
                    ? <span className="text-indigo-400 animate-pulse">typing...</span>
                    : getOtherParticipant(selectedChat)?.status === 'online' 
                      ? <span className="text-green-400">Online</span> 
                      : 'Offline'}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-1">
              <button className="p-2.5 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white">
                <Phone className="w-5 h-5" />
              </button>
              <button className="p-2.5 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white">
                <Video className="w-5 h-5" />
              </button>
              <button className="p-2.5 hover:bg-white/10 rounded-full transition-colors text-slate-300 hover:text-white">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-20 space-y-3 bg-[#0b141a] bg-opacity-90 custom-scrollbar" style={{backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%230b141a\"/%3E%3Cpath d=\"M20 20h60v60H20z\" fill=\"%23121a22\" opacity=\".05\"/%3E%3C/svg%3E')", backgroundSize: '40px 40px'}}>
            {/* Encryption Notice */}
            <div className="flex justify-center mb-6 mt-2">
              <div className="bg-slate-900/50 backdrop-blur-sm border border-white/5 px-4 py-2 rounded-xl shadow-sm">
                <p className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                  <Zap className="w-3 h-3 text-yellow-500" />
                  <span>Messages are end-to-end encrypted.</span>
                </p>
              </div>
            </div>
            {(messages || []).map((message, index) => {
              // Check if message is from current user - handle both populated and non-populated sender
              const senderId = typeof message?.sender === 'object' ? message?.sender?._id : message?.sender;
              const isOwn = senderId === user?._id;
              const showAvatar = !isOwn && (index === messages.length - 1 || messages[index + 1]?.sender?._id !== message?.sender?._id);

              return (
                <div
                  key={message._id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end space-x-2`}
                >
                  {!isOwn && (
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center flex-shrink-0 ${!showAvatar ? 'opacity-0' : ''}`}>
                      {showAvatar && (
                        message?.sender?.avatar ? (
                          <img src={message.sender.avatar} alt={message.sender?.username || 'User'} className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold">{message?.sender?.username?.[0]?.toUpperCase() || 'U'}</span>
                        )
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-lg px-3 py-2 shadow-md ${
                      isOwn
                        ? 'bg-[#005c4b] text-white rounded-br-none'
                        : 'bg-[#202c33] text-[#e9edef] rounded-bl-none'
                    }`}
                  >
                    <p className="break-words">{message.content}</p>
                    <div className={`flex items-center justify-end space-x-1 mt-1 ${isOwn ? 'text-[#8696a0]' : 'text-[#8696a0]'}`}>
                      <span className="text-xs">{formatTime(message.createdAt)}</span>
                      {isOwn && (
                        message.read ? (
                          <CheckCheck className="w-4 h-4 text-[#53bdeb]" />
                        ) : (
                          <Check className="w-4 h-4 text-[#8696a0]" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <div className="p-4 md:p-5 bg-[#0b141a]">          
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <button
                type="button"
                className="p-3 bg-slate-900/80/5 backdrop-blur-xl border border-white/10 hover:bg-slate-900/80/10 rounded-2xl transition-all focus:outline-none"
              >
                <Paperclip className="w-5 h-5 text-[#8696a0]" />
              </button>
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={messageInput}
                  onChange={handleTyping}
                  placeholder="Type a message"
                  className="w-full px-5 py-3.5 bg-slate-900/80/5 backdrop-blur-xl border border-white/10 rounded-3xl text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-white/20 focus:bg-slate-900/80/10 transition-all"
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-[#8696a0] hover:text-[#e9edef] transition-colors focus:outline-none"
                >
                  <Smile className="w-5 h-5" />
                </button>
              </div>
              <button
                type="submit"
                disabled={!messageInput.trim()}
                className="p-3.5 bg-[#00a884] backdrop-blur-xl rounded-2xl hover:bg-[#06cf9c] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg focus:outline-none"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#0b141a] min-w-0" style={{backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%230b141a\"/%3E%3Cpath d=\"M20 20h60v60H20z\" fill=\"%23121a22\" opacity=\".05\"/%3E%3C/svg%3E')", backgroundSize: '40px 40px'}}>
          <div className="text-center max-w-md px-4 md:px-8 w-full">
            <div className="w-48 h-48 md:w-64 md:h-64 lg:w-80 lg:h-80 mx-auto mb-6 md:mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-[#00a884]/20 to-[#005c4b]/20 rounded-full blur-3xl"></div>
              <MessageCircle className="w-full h-full text-[#54656f] opacity-40 relative z-10" />
            </div>
            <h3 className="text-2xl md:text-3xl font-light mb-3 text-[#e9edef]">VaaniArc Web</h3>
            <p className="text-sm md:text-base text-[#8696a0] leading-relaxed">
              Send and receive messages without keeping your phone online.<br />
              Use VaaniArc on up to 4 linked devices and 1 phone at the same time.
            </p>
            <div className="mt-6 md:mt-8 pt-4 md:pt-6 border-t border-[#2a2f32]">
              <p className="text-xs text-[#667781] flex items-center justify-center gap-1 flex-wrap">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                  <path d="M6 0L7.5 4.5L12 6L7.5 7.5L6 12L4.5 7.5L0 6L4.5 4.5L6 0Z" />
                </svg>
                End-to-end encrypted
              </p>
            </div>
          </div>
        </div>
      )}

      {/* User Profile Sidebar */}
      {showProfile && selectedUser && (
        <UserProfile
          user={selectedUser}
          onClose={() => {
            setShowProfile(false);
            setSelectedUser(null);
          }}
          onStartChat={handleStartChat}
        />
      )}
    </div>
  );
};

export default ChatsPage;
