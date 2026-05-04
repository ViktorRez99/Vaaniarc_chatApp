import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, Plus, Send, Paperclip, Smile, MoreVertical, 
  Phone, Video, Info, ArrowLeft, Check, CheckCheck,
  Image as ImageIcon, Mic, X, MessageCircle, Zap,
  Reply, Pencil, Trash2, Pin, Forward, FileText, Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import api from '../services/api';
import cryptoService from '../services/cryptoService';
import UserProfile from './UserProfile';
import RoomsPage from './RoomsPage';
import ChannelsPage from './ChannelsPage';
import MessageAttachmentCard from './MessageAttachmentCard';
import ForwardMessageDialog from './ForwardMessageDialog';
import { idsEqual, normalizeId } from '../utils/identity';
import {
  buildForwardedFromPayload,
  getForwardPreviewText,
  getMessageSenderName,
  getMessageTextContent,
  isForwardablePlaintextMessage,
  mergePinnedMessage,
  sortPinnedMessages
} from '../utils/messageForwarding';
import {
  computeExpiresAt,
  getDisappearingTimerOption,
  getNextDisappearingTimer,
  markAttachmentConsumedLocally
} from '../utils/messagePrivacy';

const ChatsPage = () => {
  const { user, encryptionState } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeMode, setActiveMode] = useState('direct');
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
  const [callStatus, setCallStatus] = useState(null);
  const [disappearingTimer, setDisappearingTimer] = useState(null);
  const [viewOnceNextFile, setViewOnceNextFile] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedChatRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioInputRef = useRef(null);
  
  // Keep the ref in sync with state
  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // Register the page-level socket listeners once against the shared socket service.
  useEffect(() => {
    fetchChats();
    setupSocketListeners();
    
    return () => {
      cleanupSocketListeners();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const openGroups = () => setActiveMode('rooms');
    const openDirectMessages = () => setActiveMode('direct');
    const openChannels = () => setActiveMode('channels');

    window.addEventListener('vaaniarc:open-groups', openGroups);
    window.addEventListener('vaaniarc:open-direct-messages', openDirectMessages);
    window.addEventListener('vaaniarc:open-channels', openChannels);

    return () => {
      window.removeEventListener('vaaniarc:open-groups', openGroups);
      window.removeEventListener('vaaniarc:open-direct-messages', openDirectMessages);
      window.removeEventListener('vaaniarc:open-channels', openChannels);
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
    if (!selectedChat?._id) {
      setMessages([]);
      setPinnedMessages([]);
      return;
    }

    fetchMessages(selectedChat._id);
    fetchPinnedMessages(selectedChat._id);
    markMessagesAsRead(selectedChat._id);
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
      const nextChats = await cryptoService.hydratePrivateChats(Array.isArray(response) ? response : []);
      setChats(nextChats);
    } catch (error) {
      console.error('Error fetching chats:', error);
      setChats([]);
    }
  };

  const fetchMessages = async (chatId) => {
    try {
      const response = await api.get(`/chats/${chatId}/messages`);
      const nextMessages = await cryptoService.hydratePrivateMessages(Array.isArray(response) ? response : []);
      setMessages(nextMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]);
    }
  };

  const fetchPinnedMessages = async (chatId) => {
    try {
      const response = await api.getPinnedChatMessages(chatId);
      const nextMessages = await cryptoService.hydratePrivateMessages(
        Array.isArray(response?.messages) ? response.messages : []
      );
      setPinnedMessages(sortPinnedMessages(nextMessages));
    } catch (error) {
      console.error('Error fetching pinned messages:', error);
      setPinnedMessages([]);
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
    socketService.on('message_sent', handleMessageSent);
    socketService.on('user_typing', handleUserTyping);
    socketService.on('user_stop_typing', handleUserStopTyping);
    socketService.on('messages_read', handleMessagesRead);
    socketService.on('call_request_sent', handleCallRequestSent);
    socketService.on('incoming_call', handleIncomingCall);
    socketService.on('private_message_reaction', handlePrivateMessageReaction);
    socketService.on('private_message_edit', handlePrivateMessageEdit);
    socketService.on('private_message_delete', handlePrivateMessageDelete);
    socketService.on('private_message_pin', handlePrivateMessagePin);
  };

  const cleanupSocketListeners = () => {
    socketService.off('private_message', handleNewMessage);
    socketService.off('message_sent', handleMessageSent);
    socketService.off('user_typing', handleUserTyping);
    socketService.off('user_stop_typing', handleUserStopTyping);
    socketService.off('messages_read', handleMessagesRead);
    socketService.off('call_request_sent', handleCallRequestSent);
    socketService.off('incoming_call', handleIncomingCall);
    socketService.off('private_message_reaction', handlePrivateMessageReaction);
    socketService.off('private_message_edit', handlePrivateMessageEdit);
    socketService.off('private_message_delete', handlePrivateMessageDelete);
    socketService.off('private_message_pin', handlePrivateMessagePin);
  };

  const syncPinnedMessageState = (nextMessage) => {
    if (!nextMessage?._id || !selectedChatRef.current?._id) {
      return;
    }

    const nextChatId = normalizeId(nextMessage.chatId || selectedChatRef.current._id);
    if (!idsEqual(nextChatId, selectedChatRef.current._id)) {
      return;
    }

    setPinnedMessages((currentMessages) => mergePinnedMessage(currentMessages, nextMessage));
  };

  const updateMessageEverywhere = (nextMessage) => {
    if (!nextMessage?._id) {
      return;
    }

    setMessages((currentMessages) => currentMessages.map((entry) => (
      idsEqual(entry._id, nextMessage._id) ? { ...entry, ...nextMessage, isOptimistic: false } : entry
    )));

    setChats((currentChats) => currentChats.map((chat) => {
      if (!idsEqual(chat._id, nextMessage.chatId || selectedChatRef.current?._id)) {
        return chat;
      }

      if (!chat.lastMessage || !idsEqual(chat.lastMessage._id, nextMessage._id)) {
        return chat;
      }

      return {
        ...chat,
        lastMessage: nextMessage,
        updatedAt: nextMessage.updatedAt || nextMessage.createdAt || chat.updatedAt
      };
    }));

    syncPinnedMessageState(nextMessage);
  };

  const handleNewMessage = async (incomingMessage) => {
    const message = await cryptoService.hydratePrivateMessage(incomingMessage);
    // This handler now only receives messages from OTHER users
    const messageChatId = normalizeId(message.chatId);
    const currentSelectedChat = selectedChatRef.current;
    const selectedChatId = normalizeId(currentSelectedChat?._id);
    
    if (currentSelectedChat && idsEqual(messageChatId, selectedChatId)) {
      setMessages(prev => {
        const optimisticIndex = prev.findIndex((entry) => (
          entry.isOptimistic && entry.tempId && message.tempId && entry.tempId === message.tempId
        ));
        if (optimisticIndex !== -1) {
          const updated = [...prev];
          updated[optimisticIndex] = { ...message, isOptimistic: false };
          return updated;
        }

        // Check if message already exists to prevent duplicates
        const exists = prev.some(m => m._id === message._id);
        if (exists) return prev;
        
        return [...prev, message];
      });
      
      // Mark as read since we're viewing this chat
      markMessagesAsRead(currentSelectedChat._id);
    }
    
    // Update chat list
    setChats(prev => {
      const updated = prev.map(chat => {
        const chatId = chat._id?.toString() || chat._id;
        if (idsEqual(chatId, messageChatId)) {
          return { ...chat, lastMessage: message, updatedAt: new Date() };
        }
        return chat;
      });
      return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  };

  // Handle confirmation of our own sent message
  const handleMessageSent = async (incomingMessage) => {
    const message = await cryptoService.hydratePrivateMessage(incomingMessage);
    const messageChatId = normalizeId(message.chatId);
    const currentSelectedChat = selectedChatRef.current;
    const selectedChatId = normalizeId(currentSelectedChat?._id);
    
    if (currentSelectedChat && idsEqual(messageChatId, selectedChatId)) {
      setMessages(prev => {
        // Prefer matching by tempId when present to avoid content collisions
        const optimisticIndexByTemp = prev.findIndex(m => m.isOptimistic && m.tempId && m.tempId === message.tempId);
        if (optimisticIndexByTemp !== -1) {
          const updated = [...prev];
          updated[optimisticIndexByTemp] = { ...message, isOptimistic: false };
          return updated;
        }

        // Fallback: match by identical content (legacy)
        const optimisticIndexByContent = prev.findIndex(m => m.isOptimistic && m.content === message.content);
        if (optimisticIndexByContent !== -1) {
          const updated = [...prev];
          updated[optimisticIndexByContent] = { ...message, isOptimistic: false };
          return updated;
        }
        
        // If no optimistic message found, check if it already exists
        const exists = prev.some(m => m._id === message._id);
        if (exists) return prev;
        
        // Add the message if it doesn't exist
        return [...prev, { ...message, isOptimistic: false }];
      });
    }
    
    // Update chat list with the sent message
    setChats(prev => {
      const updated = prev.map(chat => {
        const chatId = chat._id?.toString() || chat._id;
        if (idsEqual(chatId, messageChatId)) {
          return { ...chat, lastMessage: message, updatedAt: new Date() };
        }
        return chat;
      });
      return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    });
  };

  const handleUserTyping = ({ chatId, username }) => {
    const currentSelectedChat = selectedChatRef.current;
    if (currentSelectedChat && idsEqual(chatId, currentSelectedChat._id)) {
      setTypingUsers(prev => new Set([...prev, username]));
    }
  };

  const handleUserStopTyping = ({ chatId, userId }) => {
    const currentSelectedChat = selectedChatRef.current;
    if (currentSelectedChat && idsEqual(chatId, currentSelectedChat._id)) {
      setTypingUsers(prev => {
        const updated = new Set(prev);
        // Remove by matching user
        setChats(currentChats => {
          const chat = currentChats.find(c => idsEqual(c._id, chatId));
          const typingUser = chat?.participants.find(p => idsEqual(p._id, userId));
          if (typingUser) {
            updated.delete(typingUser.username);
          }
          return currentChats;
        });
        return updated;
      });
    }
  };

  const handleMessagesRead = ({ chatId }) => {
    const currentSelectedChat = selectedChatRef.current;
    if (currentSelectedChat && idsEqual(chatId, currentSelectedChat._id)) {
      setMessages(prev => prev.map(msg => {
        return idsEqual(msg.sender, user?._id || user?.id) ? { ...msg, read: true, readAt: new Date() } : msg;
      }));
    }

    // Also update chat list lastMessage read state
    setChats(prev => prev.map(chat => {
      if (!idsEqual(chat._id, chatId)) return chat;
      if (!chat.lastMessage) return chat;
      if (idsEqual(chat.lastMessage.sender, user?._id || user?.id)) {
        return { ...chat, lastMessage: { ...chat.lastMessage, read: true, readAt: new Date() } };
      }
      return chat;
    }));
  };

  const handlePrivateMessageReaction = async ({ message }) => {
    const hydratedMessage = await cryptoService.hydratePrivateMessage(message);
    updateMessageEverywhere(hydratedMessage);
  };

  const handlePrivateMessageEdit = async ({ message }) => {
    const hydratedMessage = await cryptoService.hydratePrivateMessage(message);
    updateMessageEverywhere(hydratedMessage);
  };

  const handlePrivateMessageDelete = async ({ message }) => {
    const hydratedMessage = await cryptoService.hydratePrivateMessage(message);
    updateMessageEverywhere(hydratedMessage);
  };

  const handlePrivateMessagePin = async ({ message }) => {
    const hydratedMessage = await cryptoService.hydratePrivateMessage(message);
    updateMessageEverywhere(hydratedMessage);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!messageInput.trim() || !selectedChat) return;

    try {
      const content = messageInput.trim();

      if (editingMessage?._id) {
        const response = await api.editMessage(editingMessage._id, content, editingMessage.updatedAt);
        const updatedMessage = await cryptoService.hydratePrivateMessage(response?.message || response?.data?.message);
        if (updatedMessage) {
          updateMessageEverywhere(updatedMessage);
        }
        setEditingMessage(null);
        setMessageInput('');
        return;
      }

      const recipient = getOtherParticipant(selectedChat) || selectedUser;

      if (!recipient?._id) {
        throw new Error('Recipient encryption key is unavailable');
      }

      const encryptedContent = await cryptoService.encryptTextForUsers(content, [
        recipient._id,
        user?._id || user?.id
      ]);
      const tempId = `temp-${Date.now()}`;
      setMessageInput('');
      
      // Stop typing indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      socketService.emit('typing_stop', { chatId: selectedChat._id });

      // Create optimistic message to show immediately
      const optimisticMessage = {
        _id: tempId, // Temporary ID to map server confirmation
        chatId: selectedChat._id,
        sender: {
          _id: user?._id || user?.id,
          username: user.username,
          avatar: user.avatar
        },
        content,
        messageType: 'text',
        createdAt: new Date().toISOString(),
        read: false,
        expiresInSeconds: disappearingTimer,
        expiresAt: computeExpiresAt(disappearingTimer),
        replyTo: replyTarget ? { ...replyTarget, replyTo: null } : null,
        tempId,
        isOptimistic: true // Flag to identify optimistic messages
      };

      setMessages(prev => [...prev, optimisticMessage]);
      setReplyTarget(null);

      // Send via socket for real-time delivery
      socketService.sendPrivateMessage(
        selectedChat._id,
        cryptoService.encryptedPlaceholder,
        'text',
        null,
        encryptedContent,
        disappearingTimer,
        tempId,
        replyTarget?._id || null
      );
    } catch (error) {
      console.error('Error sending message:', error);
      window.alert(error.message || 'Failed to send encrypted message.');
    }
  };

  const cancelComposerAction = () => {
    setReplyTarget(null);
    setEditingMessage(null);
    setMessageInput('');
  };

  const startReplyingToMessage = (message) => {
    setReplyTarget(message);
    setEditingMessage(null);
  };

  const startEditingMessage = (message) => {
    if (message?.encryptedContent || Number(message?.protocolVersion || 1) >= 2) {
      window.alert('Secure messages cannot be edited in place.');
      return;
    }

    setEditingMessage(message);
    setReplyTarget(null);
    setMessageInput(message.content || '');
  };

  const handleToggleReaction = async (message, emoji) => {
    try {
      const currentUserId = normalizeId(user?._id || user?.id);
      const alreadyReacted = Array.isArray(message.reactions) && message.reactions.some((reaction) => (
        idsEqual(reaction.user?._id || reaction.user, currentUserId) && reaction.emoji === emoji
      ));

      const response = alreadyReacted
        ? await api.removeReaction(message._id, emoji)
        : await api.addReaction(message._id, emoji);

      const updatedMessage = await cryptoService.hydratePrivateMessage(response?.message || response?.data?.message);
      if (updatedMessage) {
        updateMessageEverywhere(updatedMessage);
      }
    } catch (error) {
      console.error('Error updating reaction:', error);
      window.alert(error.message || 'Failed to update the reaction.');
    }
  };

  const handleDeleteMessage = async (message) => {
    if (!window.confirm('Delete this message?')) {
      return;
    }

    try {
      const response = await api.deleteMessage(message._id);
      const updatedMessage = await cryptoService.hydratePrivateMessage(response?.message || response?.data?.message);
      if (updatedMessage) {
        updateMessageEverywhere(updatedMessage);
      }
    } catch (error) {
      console.error('Error deleting message:', error);
      window.alert(error.message || 'Failed to delete the message.');
    }
  };

  const handleTogglePin = async (message) => {
    try {
      const response = await api.updateChatMessagePin(message._id, !message.isPinned);
      const updatedMessage = await cryptoService.hydratePrivateMessage(response?.message || response?.data?.message);
      if (updatedMessage) {
        updateMessageEverywhere(updatedMessage);
      }
    } catch (error) {
      console.error('Error updating pinned state:', error);
      window.alert(error.message || 'Failed to update the pinned message.');
    }
  };

  const getRoomMemberIds = (room) => [...new Set(
    (room?.members || [])
      .map((member) => normalizeId(member.user?._id || member.user))
      .filter(Boolean)
  )];

  const startForwardingMessage = (message) => {
    if (!isForwardablePlaintextMessage(message)) {
      window.alert('Only text messages can be forwarded right now.');
      return;
    }

    setForwardingMessage(message);
  };

  const handleForwardMessage = async ({ type, item }) => {
    if (!forwardingMessage) {
      return;
    }

    const plaintext = getMessageTextContent(forwardingMessage);
    if (!plaintext) {
      throw new Error('The message text is not available for forwarding on this device.');
    }

    const currentUserId = user?._id || user?.id;
    const forwardedFrom = buildForwardedFromPayload(forwardingMessage, 'chat', selectedChatRef.current?._id);

    if (type === 'user') {
      const targetChat = await api.createOrGetChat(item._id);
      const encryptedContent = await cryptoService.encryptTextForUsers(plaintext, [item._id, currentUserId]);
      const response = await api.sendChatMessage(targetChat._id, {
        content: cryptoService.encryptedPlaceholder,
        encryptedContent,
        forwardedFrom
      });
      const hydratedMessage = await cryptoService.hydratePrivateMessage(response?.data || response);

      if (hydratedMessage && idsEqual(targetChat._id, selectedChatRef.current?._id)) {
        setMessages((currentMessages) => (
          currentMessages.some((message) => idsEqual(message._id, hydratedMessage._id))
            ? currentMessages
            : [...currentMessages, hydratedMessage]
        ));
      }

      await fetchChats();
      return;
    }

    const roomMemberIds = getRoomMemberIds(item);
    if (!roomMemberIds.length) {
      throw new Error('The selected group is missing member encryption keys.');
    }

    const encryptedContent = await cryptoService.encryptTextForUsers(plaintext, roomMemberIds);
    await api.sendRoomMessage(item._id, {
      text: cryptoService.encryptedPlaceholder,
      encryptedContent,
      forwardedFrom
    });
  };

  const handleDownloadAttachment = async (message) => {
    try {
      if (message?.fileMetadata?.encryptionPayload) {
        const result = await cryptoService.downloadEncryptedAttachment(message);

        if (result?.consumed) {
          setMessages((currentMessages) => currentMessages.map((entry) => (
            entry._id === message._id ? markAttachmentConsumedLocally(entry) : entry
          )));
        }

        return;
      }

      if (message?.fileUrl) {
        window.open(message.fileUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error('Error downloading attachment:', error);
    }
  };

  const handleStartCall = (callType) => {
    if (!selectedChat) return;
    setCallStatus(`Calling ${callType === 'video' ? 'video' : 'audio'}...`);
    // Clear after 4s
    setTimeout(() => setCallStatus(null), 4000);
    socketService.emit('start_call_request', {
      chatId: selectedChat._id,
      callType
    });
  };

  const handleCallRequestSent = ({ chatId, callType }) => {
    if (!selectedChat || !idsEqual(chatId, selectedChat._id)) return;
    setCallStatus(`${callType === 'video' ? 'Video' : 'Audio'} call request sent`);
    setTimeout(() => setCallStatus(null), 3000);
  };

  const handleIncomingCall = ({ chatId, callType, from }) => {
    const currentChatId = selectedChatRef.current?._id;
    if (chatId && currentChatId && !idsEqual(chatId, currentChatId)) return;
    const callerName = from?.username || 'Contact';
    setCallStatus(`Incoming ${callType === 'video' ? 'video' : 'audio'} call from ${callerName}`);
    // Lightweight alert for now; real UI can be added later
    window?.alert?.(`Incoming ${callType} call from ${callerName}`);
    setTimeout(() => setCallStatus(null), 5000);
  };

  const uploadAndSendFile = async (file) => {
    if (!file || !selectedChat) return;
    const tempId = `temp-file-${Date.now()}`;

    try {
      const recipient = getOtherParticipant(selectedChat) || selectedUser;
      if (!recipient?._id) {
        throw new Error('Recipient encryption key is unavailable');
      }

      const encryptedAttachment = await cryptoService.encryptAttachmentForUsers(file, [
        recipient._id,
        user?._id || user?.id
      ]);
      const optimisticMessage = {
        _id: tempId,
        tempId,
        chatId: selectedChat._id,
        sender: {
          _id: user?._id || user?.id,
          username: user?.username,
          avatar: user?.avatar
        },
        content: encryptedAttachment.attachmentMetadata?.originalName || file.name,
        messageType: encryptedAttachment.attachmentMetadata?.category === 'image' ? 'image' : 'file',
        fileMetadata: {
          originalName: 'Encrypted attachment',
          mimetype: file.type,
          size: file.size
        },
        decryptedFileMetadata: encryptedAttachment.attachmentMetadata,
        localAttachmentPreviewUrl: encryptedAttachment.attachmentMetadata?.category === 'image'
          ? URL.createObjectURL(file)
          : null,
        createdAt: new Date().toISOString(),
        read: false,
        expiresInSeconds: disappearingTimer,
        expiresAt: computeExpiresAt(disappearingTimer),
        isViewOnce: viewOnceNextFile,
        isOptimistic: true,
        uploadState: 'uploading'
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setChats((prev) => {
        const updated = prev.map((chat) => {
          const chatId = chat._id?.toString() || chat._id;
          if (idsEqual(chatId, selectedChat._id)) {
            return {
              ...chat,
              lastMessage: optimisticMessage,
              updatedAt: optimisticMessage.createdAt
            };
          }
          return chat;
        });

        return updated.sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
      });

      const response = await api.uploadChatFile(selectedChat._id, encryptedAttachment.encryptedFile, {
        tempId,
        encryptedFilePayload: encryptedAttachment.encryptionPayload,
        expiresInSeconds: disappearingTimer,
        isViewOnce: viewOnceNextFile
      });

      const savedMessage = await cryptoService.hydratePrivateMessage(response?.data || response);
      if (!savedMessage) return;

      setMessages(prev => {
        const optimisticIndex = prev.findIndex((message) => (
          message.isOptimistic && message.tempId && message.tempId === tempId
        ));

        if (optimisticIndex !== -1) {
          const nextMessages = [...prev];
          nextMessages[optimisticIndex] = { ...savedMessage, isOptimistic: false };
          return nextMessages;
        }

        const exists = prev.some(m => m._id === savedMessage._id);
        if (exists) return prev;
        return [...prev, { ...savedMessage, isOptimistic: false }];
      });

      // Update chat list
      setChats(prev => {
        const updated = prev.map(chat => {
          const chatId = chat._id?.toString() || chat._id;
          if (idsEqual(chatId, selectedChat._id)) {
            return { ...chat, lastMessage: savedMessage, updatedAt: new Date() };
          }
          return chat;
        });
        return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      });

      if (viewOnceNextFile) {
        setViewOnceNextFile(false);
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessages((prev) => prev.map((message) => (
        message.tempId === tempId
          ? {
              ...message,
              isOptimistic: false,
              uploadState: 'failed'
            }
          : message
      )));
      window.alert(error.message || 'Failed to send encrypted attachment.');
    }
  };

  const handleFileInput = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      uploadAndSendFile(file);
      event.target.value = '';
    }
  };

  const handleTyping = (e) => {
    setMessageInput(e.target.value);

    if (!selectedChat || editingMessage) return;

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

  const handleStartChat = async (recipientIdOrUser) => {
    try {
      const recipientId = typeof recipientIdOrUser === 'object' 
        ? recipientIdOrUser._id 
        : recipientIdOrUser;
      const recipientUser = typeof recipientIdOrUser === 'object' 
        ? recipientIdOrUser 
        : null;
      
      if (recipientUser) {
        setSelectedUser(recipientUser);
      }
      
      const response = await api.post('/chats', { recipientId });
      const chat = response;
      
      let otherUser = recipientUser; 

      if (!otherUser && chat?.participants && Array.isArray(chat.participants)) {
        const currentUserId = normalizeId(user?._id || user?.id);
        otherUser = chat.participants.find(p => {
          return !idsEqual(p, currentUserId) && typeof p === 'object' && p.username;
        });
      }
      if (!otherUser?.username) {
        try {
          const userResponse = await api.get(`/users/${recipientId}`);
          const recipientUser = userResponse;
          if (recipientUser) {
            otherUser = recipientUser;
          }
        } catch (err) {
          console.error('Error fetching recipient details:', err);
        }
      }
      
      if (otherUser) {
        setSelectedUser(otherUser);
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
    if (!chat?.participants || !Array.isArray(chat.participants) || chat.participants.length === 0) {
      return null;
    }
    
    const currentUserId =
      (user?._id && user._id.toString ? user._id.toString() : user?._id) ||
      (user?.id && user.id.toString ? user.id.toString() : user?.id) ||
      '';

    for (const p of chat.participants) {
      if (typeof p === 'object' && (p._id || p.id)) {
        const raw = p._id || p.id;
        const participantId = raw?.toString ? raw.toString() : raw;
        if (participantId && currentUserId && participantId !== currentUserId) {
          return p;
        }
      } else if (typeof p === 'string') {
        if (p !== currentUserId) {
          return null;
        }
      }
    }
    
    return null;
  };

  const getDisplayName = (user) => {
    if (!user) return 'User';
    const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
    return fullName || user.username || 'User';
  };

  // Helper to select a chat and update selectedUser correctly
  const handleSelectChat = (chat) => {
    const otherUser = getOtherParticipant(chat);
    if (otherUser) {
      setSelectedUser(otherUser);
    }
    setPinnedMessages([]);
    setReplyTarget(null);
    setEditingMessage(null);
    setMessageInput('');
    setSelectedChat(chat);
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

  const encryptionBlocked = encryptionState?.status !== 'ready';
  const activeTimerOption = getDisappearingTimerOption(disappearingTimer);
  const cycleDisappearingTimer = () => {
    setDisappearingTimer((currentValue) => getNextDisappearingTimer(currentValue));
  };
  const getReactionSummary = (reactions = []) => {
    const summary = new Map();

    reactions.forEach((reaction) => {
      const key = reaction.emoji;
      if (!key) {
        return;
      }

      const currentEntry = summary.get(key) || {
        emoji: key,
        count: 0,
        reactedByCurrentUser: false
      };

      currentEntry.count += 1;
      if (idsEqual(reaction.user?._id || reaction.user, user?._id || user?.id)) {
        currentEntry.reactedByCurrentUser = true;
      }

      summary.set(key, currentEntry);
    });

    return Array.from(summary.values());
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-void overflow-hidden">
      {/* ── Mode Tabs: Premium Segmented Control ── */}
      <div className="flex items-center justify-center gap-1 border-b border-bd-subtle bg-panel/30 px-4 py-3 backdrop-blur-xl shrink-0">
        {[
          { id: 'direct', label: 'Direct', icon: MessageCircle },
          { id: 'rooms', label: 'Groups', icon: Users },
          { id: 'channels', label: 'Channels', icon: FileText },
        ].map((tab) => {
          const isActive = activeMode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveMode(tab.id)}
              className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-ui font-medium transition-all duration-base cursor-pointer border-none ${
                isActive
                  ? 'text-accent'
                  : 'text-tx-muted hover:text-tx-secondary'
              }`}
            >
              {isActive && (
                <motion.div
                  layoutId="mode-tab-indicator"
                  className="absolute inset-0 rounded-xl bg-accent/[0.08] border border-accent/20"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <tab.icon className="w-4 h-4 relative z-10" strokeWidth={1.5} />
              <span className="relative z-10 hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 min-h-0">
        {activeMode === 'rooms' ? (
          <RoomsPage />
        ) : activeMode === 'channels' ? (
          <ChannelsPage />
        ) : (
    <div className="flex h-full bg-void overflow-hidden">
      {/* ── Chat List Sidebar: Premium Glass ── */}
      <div className={`w-full md:w-80 lg:w-96 flex flex-col flex-shrink-0 ${selectedChat ? 'hidden md:flex' : 'flex'} bg-panel/20 border-r border-bd-subtle`} style={{ backdropFilter: 'var(--glass-blur)' }}>
        {/* Search Header */}
        <div className="p-4 md:p-5 border-b border-bd-subtle">
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-tx-muted group-focus-within:text-accent transition-colors duration-base" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white/[0.04] text-tx-primary placeholder-tx-muted focus:outline-none focus:ring-1 focus:ring-accent/30 focus:bg-white/[0.06] transition-all duration-base border border-white/[0.06] focus:border-accent/20"
            />
          </div>
          <button
            onClick={() => {
              setShowUserList(!showUserList);
              if (!showUserList) fetchUsers();
            }}
            className="mt-4 w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-2xl transition-all duration-base group hover:scale-[1.01] active:scale-[0.99] cursor-pointer border border-accent/15 bg-accent/[0.06] hover:bg-accent/[0.10] hover:border-accent/25 hover:shadow-glow"
          >
            <div className="p-1 rounded-lg bg-accent/15 group-hover:bg-accent/25 transition-all duration-base">
              <Plus className="w-4 h-4 text-accent" />
            </div>
            <span className="font-ui font-semibold text-accent text-sm tracking-wide">New Chat</span>
          </button>
        </div>

        {/* ── User List for New Chat ── */}
        {showUserList && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-3">
              <div className="flex items-center justify-between px-2 py-2 mb-1">
                <h3 className="font-ui font-semibold text-tx-primary text-sm">Select a contact</h3>
                <button onClick={() => setShowUserList(false)} className="text-tx-muted hover:text-tx-primary transition-colors p-1 rounded-lg hover:bg-hover/50">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {(users || []).map((u) => (
                <div
                  key={u._id}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-all duration-base group cursor-pointer"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/30 to-emerald-neon/20 flex items-center justify-center border border-white/[0.08]">
                      {u.avatar ? (
                        <img src={u.avatar} alt={getDisplayName(u)} className="w-full h-full rounded-xl object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-tx-primary">{getDisplayName(u)[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    {u.status === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-neon border-2 border-void shadow-emerald-glow"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-ui font-medium text-tx-primary text-sm">{getDisplayName(u)}</p>
                    <p className="text-xs text-tx-secondary truncate">{u.bio || 'Hey there! I am using VaaniArc'}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-base">
                    <button
                      onClick={() => {
                        setSelectedUser(u);
                        setShowProfile(true);
                        setShowUserList(false);
                      }}
                      className="p-2 bg-white/[0.06] hover:bg-white/[0.10] rounded-full transition-colors"
                      title="View profile"
                    >
                      <Info className="w-3.5 h-3.5 text-accent" />
                    </button>
                    <button
                      onClick={() => handleStartChat(u)}
                      className="p-2 bg-accent/20 hover:bg-accent/30 rounded-full transition-colors"
                      title="Start chat"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-accent" />
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
              <div className="p-3">
                <div className="px-2 py-2 text-[10px] font-mono uppercase tracking-widest text-tx-muted">Search Results ({searchResults.length})</div>
                {searchResults.map((u) => (
                <button
                  key={u._id}
                  onClick={() => {
                    setSelectedUser(u);
                    setShowProfile(true);
                    setSearchQuery('');
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/[0.04] transition-all duration-base group cursor-pointer focus:outline-none"
                >
                  <div className="relative flex-shrink-0">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-accent/30 to-emerald-neon/20 flex items-center justify-center border border-white/[0.08]">
                      {u.avatar ? (
                        <img src={u.avatar} alt={getDisplayName(u)} className="w-full h-full rounded-xl object-cover" />
                      ) : (
                        <span className="text-sm font-semibold text-tx-primary">{getDisplayName(u)[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    {u.status === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-neon border-2 border-void shadow-emerald-glow"></div>
                    )}
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-ui font-medium text-tx-primary text-sm">{getDisplayName(u)}</p>
                    <p className="text-xs text-tx-secondary truncate">{u.bio || 'Hey there! I am using VaaniArc'}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-base">
                    <div className="p-2 bg-accent/10 rounded-full" title="Click to view profile">
                      <Info className="w-3.5 h-3.5 text-accent" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
          ) : isSearching ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-3"></div>
                <p className="text-tx-muted text-sm">Searching...</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center py-8 px-4">
                <Search className="w-12 h-12 text-tx-muted mx-auto mb-3 opacity-50" />
                <p className="text-tx-primary font-medium mb-1 text-sm">No users found</p>
                <p className="text-xs text-tx-secondary">Try searching with a different username</p>
              </div>
            </div>
          )
        ) : !showUserList ? (
          /* ── Chat List: Premium Glass Cards ── */
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {(chats || []).filter(chat => {
              const other = getOtherParticipant(chat);
              if (!other?.username) return false;
              return other.username.toLowerCase().includes(searchQuery.toLowerCase());
            }).map((chat) => {
              const otherUser = getOtherParticipant(chat);
              const isSelected = idsEqual(selectedChat?._id, chat._id);
              const lastMessageSenderId = typeof chat.lastMessage?.sender === 'object' 
                ? chat.lastMessage?.sender?._id 
                : chat.lastMessage?.sender;
              const hasUnread = chat.lastMessage && !idsEqual(lastMessageSenderId, user?._id) && !chat.lastMessage.read;

              return (
                <button
                  key={chat._id}
                  onClick={() => handleSelectChat(chat)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-base cursor-pointer group text-left ${
                    isSelected 
                      ? 'bg-accent/[0.08] border border-accent/20' 
                      : 'hover:bg-white/[0.03] border border-transparent'
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center overflow-hidden transition-all duration-base ${
                      isSelected 
                        ? 'ring-2 ring-accent/30 shadow-glow' 
                        : 'ring-1 ring-white/[0.06]'
                    }`} style={{background: 'linear-gradient(135deg, rgba(0,240,255,0.20) 0%, rgba(0,255,102,0.10) 100%)'}}>
                      {otherUser?.avatar ? (
                        <img src={otherUser.avatar} alt={otherUser.username} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-lg font-bold text-tx-primary">{getDisplayName(otherUser)[0]?.toUpperCase()}</span>
                      )}
                    </div>
                    {otherUser?.status === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-neon border-[2.5px] border-panel shadow-emerald-glow"></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className={`font-ui truncate text-sm ${hasUnread ? 'font-semibold text-tx-primary' : 'font-medium text-tx-primary/90'}`}>
                        {getDisplayName(otherUser)}
                      </p>
                      {chat.lastMessage && (
                        <span className="text-[10px] font-mono text-tx-muted ml-2 flex-shrink-0">{formatTime(chat.updatedAt)}</span>
                      )}
                    </div>
                    {chat.lastMessage && (
                      <div className="flex items-center gap-1.5">
                        {idsEqual(lastMessageSenderId, user?._id) && (
                          chat.lastMessage.read ? (
                            <CheckCheck className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                          ) : (
                            <Check className="w-3.5 h-3.5 text-tx-muted flex-shrink-0" />
                          )
                        )}
                        <p className={`truncate text-xs ${hasUnread ? 'text-tx-secondary font-medium' : 'text-tx-muted'}`}>
                          {chat.lastMessage.content}
                        </p>
                      </div>
                    )}
                  </div>
                  {hasUnread && (
                    <div className="flex-shrink-0 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-[10px] font-bold bg-accent text-void shadow-glow">
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
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative chat-bg-animated">
          {/* ── Chat Header: Premium Glass ── */}
          {(() => {
            const chatPartner = getOtherParticipant(selectedChat) || selectedUser;
            return (
              <div className="absolute top-0 left-0 right-0 z-20 h-16 px-4 flex items-center justify-between border-b border-white/[0.08] bg-[#111118]">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedChat(null)}
                    className="md:hidden p-2 hover:bg-white/[0.06] rounded-full transition-colors text-tx-secondary"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => {
                      if (chatPartner) setSelectedUser(chatPartner);
                      setShowProfile(true);
                    }}
                    className="relative flex-shrink-0 w-10 h-10 rounded-xl focus:outline-none focus:ring-2 focus:ring-accent/30 flex items-center justify-center overflow-hidden"
                    style={{background: 'linear-gradient(135deg, rgba(0,240,255,0.25) 0%, rgba(0,255,102,0.12) 100%)', border: '1px solid rgba(255,255,255,0.08)'}}
                    title="View profile"
                  >
                    {chatPartner?.avatar ? (
                      <img src={chatPartner.avatar} alt={getDisplayName(chatPartner)} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-sm font-bold text-tx-primary">{getDisplayName(chatPartner)[0]?.toUpperCase() || 'U'}</span>
                    )}
                    {chatPartner?.status === 'online' && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-neon border-[2px] border-void shadow-emerald-glow"></div>
                    )}
                  </button>
                  <div className="cursor-pointer min-w-0" onClick={() => { if (chatPartner) setSelectedUser(chatPartner); setShowProfile(true); }}>
                    <p className="font-ui font-semibold text-sm md:text-base leading-tight" style={{ color: '#FAFAFA' }}>{getDisplayName(chatPartner)}</p>
                    <p className="text-xs font-mono leading-tight mt-0.5" style={{ color: '#8A8A93' }}>
                      {typingUsers.size > 0 
                        ? <span className="text-accent animate-pulse">typing...</span>
                        : chatPartner?.status === 'online' 
                          ? <span className="text-emerald-neon">Online</span> 
                          : 'Offline'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => handleStartCall('audio')} className="p-2.5 hover:bg-white/[0.06] rounded-xl transition-colors text-tx-secondary hover:text-tx-primary" title="Audio call">
                    <Phone className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                  <button type="button" onClick={() => handleStartCall('video')} className="p-2.5 hover:bg-white/[0.06] rounded-xl transition-colors text-tx-secondary hover:text-tx-primary" title="Video call">
                    <Video className="w-5 h-5" strokeWidth={1.5} />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* ── Messages Area ── */}
          <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-6 pt-20 space-y-3 custom-scrollbar">
            {callStatus && (
              <div className="flex justify-center">
                <div className="px-4 py-2 mb-3 rounded-full bg-white/10 text-white text-sm shadow-lg backdrop-blur-xl border border-white/10">
                  {callStatus}
                </div>
              </div>
            )}
            {/* Encryption Notice */}
            <div className="flex justify-center mb-6 mt-2">
              <div className="bg-white/[0.03] backdrop-blur-sm border border-white/[0.06] px-4 py-2 rounded-xl">
                <p className="text-xs text-tx-muted flex items-center gap-1.5 font-ui font-medium">
                  <Zap className="w-3 h-3 text-accent" />
                  <span>Private messages and attachments are end-to-end encrypted on this device.</span>
                </p>
              </div>
            </div>
            {encryptionState?.status !== 'ready' && (
              <div className="flex justify-center mb-4">
                <div className="max-w-xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                  {encryptionState?.message || 'Encryption is not ready on this device.'}
                </div>
              </div>
            )}
            {pinnedMessages.length > 0 && (
              <div className="mx-auto mb-4 w-full max-w-3xl rounded-2xl border border-accent/15 bg-accent/[0.05] px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-ui font-semibold uppercase tracking-[0.22em] text-accent/70">
                  <Pin className="h-3.5 w-3.5" />
                  Pinned messages
                </div>
                <div className="mt-3 space-y-2">
                  {pinnedMessages.slice(0, 3).map((pinnedMessage) => (
                    <div key={`pinned-${pinnedMessage._id}`} className="rounded-xl bg-black/15 px-3 py-2 text-sm text-white/80">
                      <p className="font-semibold text-white">
                        {getMessageSenderName(pinnedMessage)}
                      </p>
                      <p className="truncate text-white/60">
                        {getForwardPreviewText(pinnedMessage)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {(messages || []).map((message, index) => {
              const senderId = normalizeId(message?.sender);
              const currentUserId = normalizeId(user?._id || user?.id);
              const isOwn = idsEqual(senderId, currentUserId);
              const reactionSummary = getReactionSummary(message.reactions);
              const showAvatar = !isOwn && (
                index === messages.length - 1 ||
                !idsEqual(messages[index + 1]?.sender, message?.sender)
              );

              return (
                <div
                  key={message._id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'} items-end space-x-2`}
                >
                  {!isOwn && (
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden ${!showAvatar ? 'opacity-0' : ''}`} style={{background: 'linear-gradient(135deg, rgba(0,240,255,0.20) 0%, rgba(0,255,102,0.10) 100%)', border: '1px solid rgba(255,255,255,0.06)'}}>
                      {showAvatar && (
                        message?.sender?.avatar ? (
                          <img src={message.sender.avatar} alt={getMessageSenderName(message)} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-xs font-semibold text-tx-primary">{getMessageSenderName(message)[0]?.toUpperCase() || 'U'}</span>
                        )
                      )}
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-2xl px-4 py-2.5 shadow-sm ${
                      isOwn
                        ? 'bg-accent/[0.12] text-tx-primary rounded-br-md border border-accent/10'
                        : 'bg-white/[0.05] text-tx-primary rounded-bl-md border border-white/[0.06]'
                    }`}
                  >
                    {(message.isPinned || message.forwardedFrom) && (
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-wide text-white/60">
                        {message.isPinned && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1">
                            <Pin className="h-3 w-3" />
                            Pinned
                          </span>
                        )}
                        {message.forwardedFrom && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1">
                            <Forward className="h-3 w-3" />
                            Forwarded from {message.forwardedFrom?.originalSenderName || message.forwardedFrom?.originalSender?.username || 'Unknown'}
                          </span>
                        )}
                      </div>
                    )}
                    {message.replyTo && (
                      <div className={`mb-2 rounded-md border-l-2 px-3 py-2 text-xs ${
                        isOwn
                          ? 'border-white/40 bg-white/10 text-white/80'
                          : 'border-emerald-400/60 bg-black/15 text-white/70'
                      }`}>
                        <p className="font-semibold">
                          Replying to {getMessageSenderName({ sender: message.replyTo?.sender }) || 'Message'}
                        </p>
                        <p className="mt-1 line-clamp-2 break-words">
                          {message.replyTo?.content || 'Encrypted message'}
                        </p>
                      </div>
                    )}

                    {message.fileMetadata ? (
                      <MessageAttachmentCard
                        message={message}
                        isOwn={isOwn}
                        onDownload={handleDownloadAttachment}
                      />
                    ) : (
                      <p className="break-words">{message.content}</p>
                    )}

                    {reactionSummary.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reactionSummary.map((reaction) => (
                          <button
                            key={`${message._id}-${reaction.emoji}`}
                            type="button"
                            onClick={() => handleToggleReaction(message, reaction.emoji)}
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold transition-colors ${
                              reaction.reactedByCurrentUser
                                ? 'bg-amber-400/20 text-amber-100'
                                : 'bg-black/20 text-white/80'
                            }`}
                          >
                            {reaction.emoji} {reaction.count}
                          </button>
                        ))}
                      </div>
                    )}

                    {(message.isViewOnce || message.expiresAt || message.isExpired) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.isViewOnce && (
                          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                            {message.isViewOnceConsumed ? 'Opened once' : 'View once'}
                          </span>
                        )}
                        {message.expiresAt && !message.isExpired && (
                          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                            Disappears {getDisappearingTimerOption(message.expiresInSeconds).shortLabel}
                          </span>
                        )}
                        {message.isExpired && (
                          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/70">
                            Expired
                          </span>
                        )}
                      </div>
                    )}
                    {!message.isDeleted && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => startReplyingToMessage(message)}
                          className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                        >
                          <Reply className="h-3 w-3" />
                          Reply
                        </button>
                        {['👍', '❤️', '😂'].map((emoji) => (
                          <button
                            key={`${message._id}-${emoji}-quick`}
                            type="button"
                            onClick={() => handleToggleReaction(message, emoji)}
                            className="rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                          >
                            {emoji}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleTogglePin(message)}
                          className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                        >
                          <Pin className="h-3 w-3" />
                          {message.isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        {isForwardablePlaintextMessage(message) && (
                          <button
                            type="button"
                            onClick={() => startForwardingMessage(message)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                          >
                            <Forward className="h-3 w-3" />
                            Forward
                          </button>
                        )}
                        {isOwn && !message.fileMetadata && !message.encryptedContent && Number(message.protocolVersion || 1) < 2 && (
                          <button
                            type="button"
                            onClick={() => startEditingMessage(message)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        )}
                        {isOwn && (
                          <button
                            type="button"
                            onClick={() => handleDeleteMessage(message)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      {message.isEdited && (
                        <span className="text-[10px] uppercase tracking-wide text-tx-muted">edited</span>
                      )}
                      <span className="text-[11px] text-tx-muted">{formatTime(message.createdAt)}</span>
                      {isOwn && (
                        message.read ? (
                          <CheckCheck className="w-3.5 h-3.5 text-accent" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-tx-muted" />
                        )
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Message Composer: Premium Floating Bar ── */}
          <div className="relative z-10 p-3 md:p-4 bg-void/80 backdrop-blur-xl border-t border-bd-subtle">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={cycleDisappearingTimer} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.06] bg-white/[0.03] px-2.5 py-1 text-[11px] font-ui font-semibold text-tx-secondary transition-all hover:bg-white/[0.06] hover:border-accent/20" title="Cycle disappearing timer">
                <Zap className="w-3 h-3 text-accent" />
                <span>Disappear {activeTimerOption.shortLabel}</span>
              </button>
              <button type="button" onClick={() => setViewOnceNextFile((currentValue) => !currentValue)} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-ui font-semibold transition-all ${ viewOnceNextFile ? 'border-accent/30 bg-accent/[0.08] text-accent' : 'border-white/[0.06] bg-white/[0.03] text-tx-secondary hover:bg-white/[0.06]' }`} title="Make the next attachment view once">
                <ImageIcon className="w-3 h-3" />
                <span>{viewOnceNextFile ? 'View once' : 'Reusable'}</span>
              </button>
            </div>

            {(replyTarget || editingMessage) && (
              <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="font-ui font-semibold text-tx-primary text-xs">{editingMessage ? 'Editing message' : `Replying to ${getDisplayName(replyTarget?.sender) || 'message'}`}</p>
                  <p className="mt-0.5 break-words text-[11px] text-tx-muted truncate">{editingMessage?.content || replyTarget?.content || 'Encrypted message'}</p>
                </div>
                <button type="button" onClick={cancelComposerAction} className="rounded-full p-1 text-tx-muted hover:bg-white/[0.06] hover:text-tx-primary transition-colors flex-shrink-0" title="Cancel">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileInput} accept="image/*,video/*,audio/*,application/pdf,text/plain" />
              <input type="file" ref={audioInputRef} className="hidden" onChange={handleFileInput} accept="audio/*" />

              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={encryptionBlocked} className="p-2.5 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-accent/20 rounded-xl transition-all focus:outline-none" title="Send file, image or video">
                <Paperclip className="w-5 h-5 text-tx-secondary" strokeWidth={1.5} />
              </button>
              <button type="button" onClick={() => audioInputRef.current?.click()} disabled={encryptionBlocked} className="p-2.5 bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-accent/20 rounded-xl transition-all focus:outline-none" title="Send audio">
                <Mic className="w-5 h-5 text-tx-secondary" strokeWidth={1.5} />
              </button>
              <div className="flex-1 relative">
                <input type="text" value={messageInput} onChange={handleTyping} disabled={encryptionBlocked} placeholder={ encryptionBlocked ? 'Import your key backup to send encrypted messages' : editingMessage ? 'Edit your message' : replyTarget ? 'Write your reply' : 'Type a message...' } className="w-full px-4 py-3 bg-white/[0.03] border border-white/[0.06] rounded-2xl text-tx-primary placeholder-tx-muted focus:outline-none focus:border-accent/20 focus:bg-white/[0.05] transition-all text-sm" />
                <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-tx-muted hover:text-tx-primary transition-colors focus:outline-none" title="Emoji">
                  <Smile className="w-5 h-5" strokeWidth={1.5} />
                </button>
              </div>
              <button type="submit" disabled={!messageInput.trim() || encryptionBlocked} className="p-3 bg-accent text-void rounded-xl hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-glow active:scale-95" title={editingMessage ? 'Save edit' : 'Send'}>
                <Send className="w-5 h-5" strokeWidth={2} />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-void min-w-0 relative overflow-hidden">
          {/* Animated background orbs */}
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-accent/[0.03] blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-emerald-neon/[0.02] blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
          
          <div className="text-center max-w-md px-4 md:px-8 w-full relative z-10">
            {/* Custom animated hexagon logo */}
            <div className="w-32 h-32 md:w-40 md:h-40 mx-auto mb-8 relative">
              <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-emerald-neon/10 rounded-full blur-2xl animate-pulse" />
              <div className="relative w-full h-full flex items-center justify-center">
                <svg viewBox="0 0 100 100" className="w-full h-full text-accent/30 animate-spin" style={{ animationDuration: '20s' }}>
                  <path d="M50 5 L90 27.5 L90 72.5 L50 95 L10 72.5 L10 27.5 Z" fill="none" stroke="currentColor" strokeWidth="0.5" />
                  <path d="M50 20 L75 35 L75 65 L50 80 L25 65 L25 35 Z" fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.5" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 16 16" fill="none">
                    <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="var(--accent)" strokeWidth="1" fill="none" />
                    <circle cx="8" cy="8" r="2" fill="var(--accent)" opacity="0.5" />
                  </svg>
                </div>
              </div>
            </div>
            
            <h3 className="text-xl md:text-2xl font-display font-semibold mb-2 text-tx-primary tracking-tight">VaaniArc</h3>
            <p className="text-sm text-tx-secondary leading-relaxed mb-1">
              Select a conversation to start messaging
            </p>
            <p className="text-xs text-tx-muted">
              End-to-end encrypted. Post-quantum secure.
            </p>
            
            <div className="mt-8 pt-4 border-t border-bd-subtle">
              <div className="flex items-center justify-center gap-4 text-[10px] font-mono uppercase tracking-widest text-tx-muted">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent shadow-glow" />
                  Zero-Knowledge
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-neon shadow-emerald-glow" />
                  E2EE
                </span>
              </div>
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
      <ForwardMessageDialog
        isOpen={Boolean(forwardingMessage)}
        excludeRoomId={null}
        excludeUserId={getOtherParticipant(selectedChat)?._id || null}
        messagePreview={forwardingMessage ? getForwardPreviewText(forwardingMessage) : ''}
        onClose={() => setForwardingMessage(null)}
        onForward={handleForwardMessage}
      />
    </div>
        )}
      </div>
    </div>
  );
};

export default ChatsPage;
