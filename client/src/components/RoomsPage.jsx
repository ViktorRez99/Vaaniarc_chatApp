import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  File,
  Forward,
  Globe,
  Lock,
  MessageCircle,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Search,
  Send,
  Smile,
  Trash2,
  Users,
  Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import socketService from '../services/socket';
import cryptoService from '../services/cryptoService';
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

const INITIAL_ROOM_FORM = {
  name: '',
  description: '',
  type: 'public'
};

const sortRoomsByActivity = (rooms = []) => [...rooms].sort(
  (left, right) => new Date(right.lastActivity || right.updatedAt || 0) - new Date(left.lastActivity || left.updatedAt || 0)
);

const getDisplayName = (user) => {
  if (!user) return 'User';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  return fullName || user.username || 'User';
};

const RoomsPage = () => {
  const { user, encryptionState } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [publicRooms, setPublicRooms] = useState([]);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [typingUsers, setTypingUsers] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [roomForm, setRoomForm] = useState(INITIAL_ROOM_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState('');
  const [joiningRoomId, setJoiningRoomId] = useState(null);
  const [disappearingTimer, setDisappearingTimer] = useState(null);
  const [viewOnceNextFile, setViewOnceNextFile] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState([]);
  const [forwardingMessage, setForwardingMessage] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedRoomRef = useRef(null);
  const fileInputRef = useRef(null);
  const socketHandlersRef = useRef({});
  const socketListenerRefs = useRef(new Map());
  const encryptionBlocked = encryptionState?.status !== 'ready';

  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  // Register the page-level socket listeners once against the shared socket service.
  useEffect(() => {
    void loadRooms();
    setupSocketListeners();

    const openGroupCreator = () => setShowCreateRoom(true);
    window.addEventListener('vaaniarc:open-group-creator', openGroupCreator);

    return () => {
      cleanupSocketListeners();
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      window.removeEventListener('vaaniarc:open-group-creator', openGroupCreator);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!selectedRoom?._id) {
      setMessages([]);
      setPinnedMessages([]);
      setTypingUsers(new Set());
      setEditingMessage(null);
      setMessageInput('');
      return undefined;
    }

    socketService.joinRoom(selectedRoom._id);
    setEditingMessage(null);
    setMessageInput('');
    void fetchRoomMessages(selectedRoom._id);
    void fetchPinnedRoomMessages(selectedRoom._id);

    return () => {
      socketService.leaveRoom(selectedRoom._id);
      stopTypingIndicator(selectedRoom._id);
    };
  }, [selectedRoom?._id]);

  const directRoomIds = useMemo(
    () => new Set((rooms || []).map((room) => normalizeId(room._id))),
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return rooms;
    }

    return rooms.filter((room) => {
      const name = String(room.name || '').toLowerCase();
      const description = String(room.description || '').toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [rooms, searchQuery]);

  const filteredPublicRooms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return (publicRooms || [])
      .filter((room) => !directRoomIds.has(normalizeId(room._id)))
      .filter((room) => {
        if (!query) {
          return true;
        }

        const name = String(room.name || '').toLowerCase();
        const description = String(room.description || '').toLowerCase();
        return name.includes(query) || description.includes(query);
      });
  }, [directRoomIds, publicRooms, searchQuery]);

  const stopTypingIndicator = (roomId = selectedRoomRef.current?._id) => {
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    if (roomId) {
      socketService.stopRoomTyping(roomId);
    }
  };

  const loadRooms = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [joinedRooms, discoverableRooms] = await Promise.all([
        api.getRooms(),
        api.getPublicRooms('', 12)
      ]);

      const nextRooms = sortRoomsByActivity(Array.isArray(joinedRooms) ? joinedRooms : []);
      setRooms(nextRooms);
      setPublicRooms(Array.isArray(discoverableRooms) ? discoverableRooms : []);

      if (selectedRoomRef.current?._id) {
        const refreshedSelectedRoom = nextRooms.find((room) => idsEqual(room._id, selectedRoomRef.current._id));
        setSelectedRoom(refreshedSelectedRoom || null);
      }
    } catch (loadError) {
      console.error('Error loading rooms:', loadError);
      setError(loadError.message || 'Failed to load rooms.');
      setRooms([]);
      setPublicRooms([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRoomMessages = async (roomId) => {
    try {
      const response = await api.getRoomMessages(roomId);
      const decryptedMessages = await cryptoService.hydrateRoomMessages(Array.isArray(response) ? response : []);
      setMessages(decryptedMessages);
    } catch (fetchError) {
      console.error('Error fetching room messages:', fetchError);
      setError(fetchError.message || 'Failed to load room messages.');
      setMessages([]);
    }
  };

  const fetchPinnedRoomMessages = async (roomId) => {
    try {
      const response = await api.getPinnedRoomMessages(roomId);
      const decryptedMessages = await cryptoService.hydrateRoomMessages(
        Array.isArray(response?.messages) ? response.messages : []
      );
      setPinnedMessages(sortPinnedMessages(decryptedMessages));
    } catch (fetchError) {
      console.error('Error fetching pinned room messages:', fetchError);
      setPinnedMessages([]);
    }
  };

  const setupSocketListeners = () => {
    const listeners = [
      ['room_message', 'handleRoomMessage'],
      ['room_message_pin', 'handleRoomMessagePin'],
      ['room_message_reaction', 'handleRoomMessagePin'],
      ['room_message_edit', 'handleRoomMessagePin'],
      ['room_message_delete', 'handleRoomMessagePin'],
      ['user_typing_room', 'handleUserTypingRoom'],
      ['user_stop_typing_room', 'handleUserStopTypingRoom']
    ];

    listeners.forEach(([eventName, handlerName]) => {
      const listener = (payload) => socketHandlersRef.current[handlerName]?.(payload);
      socketListenerRefs.current.set(eventName, listener);
      socketService.on(eventName, listener);
    });
  };

  const cleanupSocketListeners = () => {
    socketListenerRefs.current.forEach((listener, eventName) => {
      socketService.off(eventName, listener);
    });
    socketListenerRefs.current.clear();
  };

  const updateRoomMessageEverywhere = (nextMessage) => {
    if (!nextMessage?._id) {
      return;
    }

    setMessages((currentMessages) => currentMessages.map((message) => (
      idsEqual(message._id, nextMessage._id) ? { ...message, ...nextMessage, isOptimistic: false } : message
    )));

    if (selectedRoomRef.current?._id && idsEqual(nextMessage.room?._id || nextMessage.room, selectedRoomRef.current._id)) {
      setPinnedMessages((currentMessages) => mergePinnedMessage(currentMessages, nextMessage));
    }
  };

  const handleRoomMessage = async (incomingMessage) => {
    const hydratedMessage = await cryptoService.hydrateRoomMessage(incomingMessage);
    const incomingRoomId = normalizeId(hydratedMessage?.room?._id || hydratedMessage?.room);
    const currentRoomId = normalizeId(selectedRoomRef.current?._id);

    setRooms((currentRooms) => sortRoomsByActivity(currentRooms.map((room) => (
      idsEqual(room._id, incomingRoomId)
        ? { ...room, lastActivity: hydratedMessage.createdAt || new Date().toISOString() }
        : room
    ))));

    if (!currentRoomId || !idsEqual(currentRoomId, incomingRoomId)) {
      return;
    }

    setMessages((currentMessages) => {
      const optimisticIndex = currentMessages.findIndex(
        (message) => message.isOptimistic && message.tempId && message.tempId === hydratedMessage.tempId
      );

      if (optimisticIndex !== -1) {
        const nextMessages = [...currentMessages];
        nextMessages[optimisticIndex] = { ...hydratedMessage, isOptimistic: false };
        return nextMessages;
      }

      if (currentMessages.some((message) => message._id === hydratedMessage._id)) {
        return currentMessages;
      }

      return [...currentMessages, hydratedMessage];
    });
  };

  const handleRoomMessagePin = async ({ message }) => {
    const hydratedMessage = await cryptoService.hydrateRoomMessage(message);
    updateRoomMessageEverywhere(hydratedMessage);
  };

  const handleUserTypingRoom = ({ roomId, username, userId }) => {
    if (!idsEqual(roomId, selectedRoomRef.current?._id) || idsEqual(userId, user?._id || user?.id)) {
      return;
    }

    setTypingUsers((currentUsers) => new Set([...currentUsers, username]));
  };

  const handleUserStopTypingRoom = ({ roomId, userId }) => {
    if (!idsEqual(roomId, selectedRoomRef.current?._id)) {
      return;
    }

    setTypingUsers((currentUsers) => {
      const nextUsers = new Set(currentUsers);
      const member = selectedRoomRef.current?.members?.find((entry) => idsEqual(entry.user?._id || entry.user, userId));

      if (member?.user?.username) {
        nextUsers.delete(member.user.username);
      }

      return nextUsers;
    });
  };

  useEffect(() => {
    socketHandlersRef.current = {
      handleRoomMessage,
      handleRoomMessagePin,
      handleUserTypingRoom,
      handleUserStopTypingRoom
    };
  });

  const getRoomMemberIds = (room) => [...new Set(
    (room?.members || [])
      .map((entry) => normalizeId(entry.user?._id || entry.user))
      .filter(Boolean)
  )];

  const selectRoom = (room) => {
    setSelectedRoom(room);
    setShowCreateRoom(false);
    setError('');
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();

    if (!selectedRoom || !messageInput.trim()) {
      return;
    }

    if (editingMessage?._id) {
      try {
        const response = await api.editRoomMessage(
          selectedRoom._id,
          editingMessage._id,
          messageInput.trim(),
          editingMessage.updatedAt
        );
        const updatedMessage = await cryptoService.hydrateRoomMessage(response?.message || response?.data?.message);
        if (updatedMessage) {
          updateRoomMessageEverywhere(updatedMessage);
        }
        setEditingMessage(null);
        setMessageInput('');
      } catch (editError) {
        console.error('Error editing room message:', editError);
        setError(editError.message || 'Failed to edit room message.');
        setEditingMessage(null);
      }
      return;
    }

    if (encryptionState?.status !== 'ready') {
      setError(encryptionState?.message || 'Encryption is not ready on this device.');
      return;
    }

    try {
      const content = messageInput.trim();
      const tempId = `room-temp-${Date.now()}`;
      const encryptedContent = await cryptoService.encryptTextForUsers(content, getRoomMemberIds(selectedRoom));

      setMessageInput('');
      stopTypingIndicator(selectedRoom._id);

      const optimisticMessage = {
        _id: tempId,
        tempId,
        room: selectedRoom._id,
        sender: {
          _id: user?._id || user?.id,
          username: user?.username,
          avatar: user?.avatar
        },
        content: { text: content },
        createdAt: new Date().toISOString(),
        expiresInSeconds: disappearingTimer,
        expiresAt: computeExpiresAt(disappearingTimer),
        isOptimistic: true
      };

      setMessages((currentMessages) => [...currentMessages, optimisticMessage]);

      socketService.sendRoomMessage(
        selectedRoom._id,
        cryptoService.encryptedPlaceholder,
        'text',
        null,
        encryptedContent,
        tempId,
        disappearingTimer
      );
    } catch (sendError) {
      console.error('Error sending encrypted room message:', sendError);
      setError(sendError.message || 'Failed to send encrypted room message.');
    }
  };

  const handleTyping = (event) => {
    const nextValue = event.target.value;
    setMessageInput(nextValue);

    if (!selectedRoom?._id) {
      return;
    }

    socketService.startRoomTyping(selectedRoom._id);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      stopTypingIndicator(selectedRoom._id);
    }, 2000);
  };

  const handleCreateRoom = async (event) => {
    event.preventDefault();

    if (!roomForm.name.trim()) {
      setError('Room name is required.');
      return;
    }

    setIsCreating(true);
    setError('');

    try {
      const createdRoom = await api.createRoom({
        name: roomForm.name.trim(),
        description: roomForm.description.trim(),
        type: roomForm.type
      });

      const nextRooms = sortRoomsByActivity([createdRoom, ...rooms]);
      setRooms(nextRooms);
      if (createdRoom.type === 'public') {
        setPublicRooms((currentPublicRooms) => sortRoomsByActivity([createdRoom, ...currentPublicRooms]));
      }
      setSelectedRoom(createdRoom);
      setRoomForm(INITIAL_ROOM_FORM);
      setShowCreateRoom(false);
    } catch (createError) {
      console.error('Error creating room:', createError);
      setError(createError.message || 'Failed to create room.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (roomId) => {
    setJoiningRoomId(roomId);
    setError('');

    try {
      const response = await api.joinRoom(roomId);
      const joinedRoom = response?.room || response;

      setRooms((currentRooms) => sortRoomsByActivity([joinedRoom, ...currentRooms.filter((room) => !idsEqual(room._id, joinedRoom._id))]));
      setSelectedRoom(joinedRoom);
    } catch (joinError) {
      console.error('Error joining room:', joinError);
      setError(joinError.message || 'Failed to join room.');
    } finally {
      setJoiningRoomId(null);
    }
  };

  const handleTogglePin = async (message) => {
    try {
      const response = await api.updateRoomMessagePin(selectedRoom._id, message._id, !message.isPinned);
      const updatedMessage = await cryptoService.hydrateRoomMessage(response?.message || response?.data?.message);
      if (updatedMessage) {
        updateRoomMessageEverywhere(updatedMessage);
      }
    } catch (pinError) {
      console.error('Error updating room pin state:', pinError);
      setError(pinError.message || 'Failed to update the pinned message.');
    }
  };

  const handleToggleReaction = async (message, emoji) => {
    try {
      const response = await api.reactToRoomMessage(selectedRoom._id, message._id, emoji);
      const updatedMessage = await cryptoService.hydrateRoomMessage(response?.message || response?.data?.message);
      if (updatedMessage) {
        updateRoomMessageEverywhere(updatedMessage);
      }
    } catch (reactionError) {
      console.error('Error updating room reaction:', reactionError);
      setError(reactionError.message || 'Failed to update reaction.');
    }
  };

  const startEditingMessage = (message) => {
    const text = getMessageTextContent(message);
    if (!text || message.encryptedContent) {
      setError('Secure room messages cannot be edited in place.');
      return;
    }

    setEditingMessage(message);
    setMessageInput(text);
  };

  const cancelEditingMessage = () => {
    setEditingMessage(null);
    setMessageInput('');
  };

  const handleDeleteRoomMessage = async (message) => {
    if (!window.confirm('Delete this room message?')) {
      return;
    }

    try {
      const response = await api.deleteRoomMessage(selectedRoom._id, message._id);
      const updatedMessage = await cryptoService.hydrateRoomMessage(response?.message || response?.data?.message);
      if (updatedMessage) {
        updateRoomMessageEverywhere(updatedMessage);
      }
    } catch (deleteError) {
      console.error('Error deleting room message:', deleteError);
      setError(deleteError.message || 'Failed to delete room message.');
    }
  };

  const startForwardingMessage = (message) => {
    if (!isForwardablePlaintextMessage(message)) {
      setError('Only text messages can be forwarded right now.');
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
    const forwardedFrom = buildForwardedFromPayload(forwardingMessage, 'room', selectedRoomRef.current?._id);

    if (type === 'user') {
      const targetChat = await api.createOrGetChat(item._id);
      const encryptedContent = await cryptoService.encryptTextForUsers(plaintext, [item._id, currentUserId]);
      await api.sendChatMessage(targetChat._id, {
        content: cryptoService.encryptedPlaceholder,
        encryptedContent,
        forwardedFrom
      });
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
    await loadRooms();
  };

  const formatTime = (date) => {
    const value = new Date(date);

    if (Number.isNaN(value.getTime())) {
      return '';
    }

    return value.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const handleDownloadAttachment = async (message) => {
    try {
      const hasEncryptedAttachment = Boolean(
        message?.fileMetadata?.encryptionPayload || message?.content?.file?.encryptionPayload
      );

      if (hasEncryptedAttachment) {
        const result = await cryptoService.downloadEncryptedAttachment(message);

        if (!result?.downloaded) {
          throw new Error('Encrypted attachment is not available on this device.');
        }

        if (result.consumed) {
          setMessages((currentMessages) => currentMessages.map((entry) => (
            entry._id === message._id ? markAttachmentConsumedLocally(entry) : entry
          )));
        }

        return;
      }

      const fileUrl = message?.fileUrl || message?.content?.file?.url;
      if (fileUrl) {
        window.open(fileUrl, '_blank', 'noopener,noreferrer');
      }
    } catch (downloadError) {
      console.error('Error downloading room attachment:', downloadError);
      setError(downloadError.message || 'Failed to download the attachment.');
    }
  };

  const handleUploadFile = async (file) => {
    if (!file || !selectedRoom) {
      return;
    }

    if (encryptionBlocked) {
      setError(encryptionState?.message || 'Encryption is not ready on this device.');
      return;
    }

    const tempId = `room-file-${Date.now()}`;

    try {
      const encryptedAttachment = await cryptoService.encryptAttachmentForUsers(
        file,
        getRoomMemberIds(selectedRoom)
      );
      const optimisticMessage = {
        _id: tempId,
        tempId,
        room: selectedRoom._id,
        sender: {
          _id: user?._id || user?.id,
          username: user?.username,
          avatar: user?.avatar
        },
        content: {
          text: encryptedAttachment.attachmentMetadata?.originalName || file.name,
          file: {
            mimetype: file.type,
            size: file.size
          }
        },
        decryptedFileMetadata: encryptedAttachment.attachmentMetadata,
        localAttachmentPreviewUrl: encryptedAttachment.attachmentMetadata?.category === 'image'
          ? URL.createObjectURL(file)
          : null,
        createdAt: new Date().toISOString(),
        expiresInSeconds: disappearingTimer,
        expiresAt: computeExpiresAt(disappearingTimer),
        isViewOnce: viewOnceNextFile,
        isOptimistic: true,
        uploadState: 'uploading'
      };

      setMessages((currentMessages) => [...currentMessages, optimisticMessage]);
      setRooms((currentRooms) => sortRoomsByActivity(currentRooms.map((room) => (
        idsEqual(room._id, selectedRoom._id)
          ? { ...room, lastActivity: optimisticMessage.createdAt }
          : room
      ))));

      const response = await api.uploadRoomFile(selectedRoom._id, encryptedAttachment.encryptedFile, {
        tempId,
        encryptedFilePayload: encryptedAttachment.encryptionPayload,
        expiresInSeconds: disappearingTimer,
        isViewOnce: viewOnceNextFile
      });

      const savedMessage = await cryptoService.hydrateRoomMessage(response?.data || response);
      if (!savedMessage) {
        return;
      }

      setMessages((currentMessages) => {
        const optimisticIndex = currentMessages.findIndex((message) => (
          message.isOptimistic && message.tempId && message.tempId === tempId
        ));

        if (optimisticIndex !== -1) {
          const nextMessages = [...currentMessages];
          nextMessages[optimisticIndex] = { ...savedMessage, isOptimistic: false };
          return nextMessages;
        }

        if (currentMessages.some((message) => message._id === savedMessage._id)) {
          return currentMessages;
        }

        return [...currentMessages, savedMessage];
      });

      if (viewOnceNextFile) {
        setViewOnceNextFile(false);
      }
    } catch (uploadError) {
      console.error('Error uploading encrypted room attachment:', uploadError);
      setMessages((currentMessages) => currentMessages.map((message) => (
        message.tempId === tempId
          ? {
              ...message,
              isOptimistic: false,
              uploadState: 'failed'
            }
          : message
      )));
      setError(uploadError.message || 'Failed to send the encrypted room attachment.');
    }
  };

  const handleFileInput = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (file) {
      void handleUploadFile(file);
    }
  };

  const renderRoomListItem = (room, isDiscover = false) => {
    const isSelected = idsEqual(selectedRoom?._id, room._id) && !isDiscover;
    const memberCount = room.members?.length || 0;
    const content = (
      <div className="flex items-center gap-3 p-3 text-left">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
          room.type === 'private'
            ? 'bg-gradient-to-br from-indigo-500 to-violet-600'
            : 'bg-gradient-to-br from-accent/30 to-emerald-neon/20'
        }`}>
          {room.type === 'private' ? (
            <Lock className="w-5 h-5 text-white" />
          ) : (
            <Globe className="w-5 h-5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-white">{room.name}</p>
            {!isDiscover && (
              <span className="text-[11px] text-white/40">
                {room.lastActivity ? formatTime(room.lastActivity) : ''}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-white/55">
            {room.description || `${memberCount} member${memberCount === 1 ? '' : 's'}`}
          </p>
        </div>

        {isDiscover ? (
          <button
            type="button"
            onClick={() => handleJoinRoom(room._id)}
            disabled={joiningRoomId === room._id}
            className="rounded-xl bg-accent text-void hover:brightness-110 px-3 py-2 text-xs font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-60"
          >
            {joiningRoomId === room._id ? 'Joining...' : 'Join'}
          </button>
        ) : (
          <div className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
            {memberCount}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={`${isDiscover ? 'discover' : 'joined'}-${room._id}`}
        className={`w-full rounded-2xl border transition-all ${
          isSelected
            ? 'border-emerald-400/30 bg-white/10'
            : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]'
        }`}
      >
        {isDiscover ? (
          content
        ) : (
          <button
            type="button"
            onClick={() => selectRoom(room)}
            className="w-full"
          >
            {content}
          </button>
        )}
      </div>
    );
  };

  const activeTimerOption = getDisappearingTimerOption(disappearingTimer);
  const cycleDisappearingTimer = () => {
    setDisappearingTimer((currentValue) => getNextDisappearingTimer(currentValue));
  };
  const getReactionSummary = (reactions = []) => {
    const summary = new Map();

    reactions.forEach((reaction) => {
      const emoji = reaction.emoji;
      if (!emoji) {
        return;
      }

      const entry = summary.get(emoji) || {
        emoji,
        count: 0,
        reactedByCurrentUser: false
      };
      entry.count += 1;
      if (idsEqual(reaction.user?._id || reaction.user, user?._id || user?.id)) {
        entry.reactedByCurrentUser = true;
      }
      summary.set(emoji, entry);
    });

    return Array.from(summary.values());
  };
  const typingText = typingUsers.size > 0
    ? `${Array.from(typingUsers).join(', ')} typing...`
    : `${selectedRoom?.members?.length || 0} member${selectedRoom?.members?.length === 1 ? '' : 's'}`;

  return (
    <div className="flex h-full bg-void overflow-hidden">
      <div className={`w-full md:w-80 lg:w-96 flex flex-col flex-shrink-0 ${selectedRoom ? 'hidden md:flex' : 'flex'}`} style={{ background: 'linear-gradient(180deg, rgba(30,30,40,0.95) 0%, rgba(15,15,25,0.98) 100%)', backdropFilter: 'blur(40px) saturate(180%)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4 md:p-5 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search groups and public rooms"
              className="w-full pl-11 pr-4 py-3 rounded-2xl text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          <button
            type="button"
            onClick={() => setShowCreateRoom((currentValue) => !currentValue)}
            className="mt-4 w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-emerald-200 transition-all hover:scale-[1.02]"
            style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.25) 0%, rgba(16,185,129,0.15) 100%)', border: '1px solid rgba(34,197,94,0.3)' }}
          >
            <Plus className="w-4 h-4" />
            <span className="font-semibold tracking-wide">Create Group</span>
          </button>
        </div>

        {showCreateRoom && (
          <form onSubmit={handleCreateRoom} className="m-3 rounded-2xl border border-accent/15 bg-accent/[0.05] p-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Group Name</label>
              <input
                type="text"
                value={roomForm.name}
                onChange={(event) => setRoomForm((currentValue) => ({ ...currentValue, name: event.target.value }))}
                maxLength={50}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="Project Squad"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Description</label>
              <textarea
                value={roomForm.description}
                onChange={(event) => setRoomForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
                maxLength={200}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="What is this room for?"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['public', 'private'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setRoomForm((currentValue) => ({ ...currentValue, type }))}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    roomForm.type === type
                      ? 'border-emerald-400/40 bg-accent hover:brightness-110/20 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {type === 'public' ? 'Public Room' : 'Private Group'}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isCreating}
                className="flex-1 rounded-xl bg-accent text-void hover:brightness-110 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-60"
              >
                {isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateRoom(false);
                  setRoomForm(INITIAL_ROOM_FORM);
                }}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="mx-3 mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Your Groups</div>
            {isLoading ? (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                Loading your rooms...
              </div>
            ) : filteredRooms.length > 0 ? (
              filteredRooms.map((room) => renderRoomListItem(room))
            ) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No joined rooms yet. Create one or join a public room below.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Discover Public Rooms</div>
            {filteredPublicRooms.length > 0 ? (
              filteredPublicRooms.map((room) => renderRoomListItem(room, true))
            ) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No public rooms match this search right now.
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedRoom ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative chat-bg-animated">
          <div className="absolute top-0 left-0 right-0 z-20 h-16 px-4 flex items-center justify-between border-b border-white/[0.08] bg-[#111118]">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedRoom(null)}
                className="md:hidden p-2 rounded-full text-slate-200 transition-colors hover:bg-white/10"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                selectedRoom.type === 'private'
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600'
                  : 'bg-gradient-to-br from-accent/30 to-emerald-neon/20'
              }`}>
                {selectedRoom.type === 'private' ? (
                  <Lock className="w-5 h-5 text-white" />
                ) : (
                  <Users className="w-5 h-5 text-white" />
                )}
              </div>

              <div>
                <p className="font-semibold text-white">{selectedRoom.name}</p>
                <p className="text-xs text-slate-400">{typingText}</p>
              </div>
            </div>

            <div className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/60">
              {selectedRoom.type === 'private' ? 'Private group' : 'Public room'}
            </div>
          </div>

          <div className="relative z-10 flex-1 overflow-y-auto p-4 md:p-6 pt-20 space-y-3">
            <div className="flex justify-center">
              <div className="rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Zap className="w-3 h-3 text-yellow-500" />
                  <span>Group messages are encrypted for the members currently in this room on this device.</span>
                </p>
              </div>
            </div>

            {encryptionBlocked && (
              <div className="mx-auto max-w-xl rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {encryptionState?.message || 'Encryption is not ready on this device.'}
              </div>
            )}
            {pinnedMessages.length > 0 && (
              <div className="mx-auto w-full max-w-3xl rounded-2xl border border-indigo-400/20 bg-indigo-500/10 px-4 py-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200/80">
                  <Pin className="h-3.5 w-3.5" />
                  Pinned messages
                </div>
                <div className="mt-3 space-y-2">
                  {pinnedMessages.slice(0, 3).map((pinnedMessage) => (
                    <div key={`room-pinned-${pinnedMessage._id}`} className="rounded-xl bg-black/15 px-3 py-2 text-sm text-white/80">
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

            {(messages || []).map((message) => {
              const senderId = normalizeId(message?.sender?._id || message?.sender);
              const isOwn = idsEqual(senderId, user?._id || user?.id);
              const reactionSummary = getReactionSummary(message.reactions);
              const isModerator = (selectedRoom?.admins || []).some((adminId) => idsEqual(adminId, user?._id || user?.id))
                || (selectedRoom?.moderators || []).some((moderatorId) => idsEqual(moderatorId, user?._id || user?.id))
                || idsEqual(selectedRoom?.creator?._id || selectedRoom?.creator, user?._id || user?.id);
              const canEditMessage = isOwn
                && !message.encryptedContent
                && message.messageType === 'text'
                && !message.isDeleted;
              const canDeleteMessage = (isOwn || isModerator) && !message.isDeleted;
              const hasAttachment = Boolean(
                message?.content?.file?.url
                || message?.fileUrl
                || message?.decryptedFileMetadata
                || message?.content?.file
              );

              return (
                <div
                  key={message._id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-lg px-3 py-2 shadow-md ${
                    isOwn
                      ? 'bg-accent/[0.12] text-tx-primary rounded-br-md border border-accent/10'
                      : 'bg-white/[0.05] text-tx-primary rounded-bl-md border border-white/[0.06]'
                  }`}>
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
                    {!isOwn && (
                      <p className="mb-1 text-xs font-semibold text-emerald-300">
                        {getDisplayName(message?.sender) || 'Member'}
                      </p>
                    )}

                    {hasAttachment ? (
                      <MessageAttachmentCard
                        message={message}
                        isOwn={isOwn}
                        onDownload={handleDownloadAttachment}
                      />
                    ) : (
                      <p className="break-words">{message?.content?.text || ''}</p>
                    )}
                    {message.isEdited && (
                      <div className="mt-1 text-[10px] uppercase tracking-wide text-white/40">
                        edited
                      </div>
                    )}

                    {reactionSummary.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {reactionSummary.map((reaction) => (
                          <button
                            key={reaction.emoji}
                            type="button"
                            onClick={() => handleToggleReaction(message, reaction.emoji)}
                            className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                              reaction.reactedByCurrentUser
                                ? 'bg-accent/25 text-accent'
                                : 'bg-black/20 text-white/75 hover:bg-black/30'
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
                          onClick={() => handleTogglePin(message)}
                          className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                        >
                          <Pin className="h-3 w-3" />
                          {message.isPinned ? 'Unpin' : 'Pin'}
                        </button>
                        {['👍', '❤️', '😂'].map((emoji) => (
                          <button
                            key={emoji}
                            type="button"
                            onClick={() => handleToggleReaction(message, emoji)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                          >
                            <Smile className="h-3 w-3" />
                            {emoji}
                          </button>
                        ))}
                        {canEditMessage && (
                          <button
                            type="button"
                            onClick={() => startEditingMessage(message)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-white/80 transition-colors hover:bg-black/25"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                        )}
                        {canDeleteMessage && (
                          <button
                            type="button"
                            onClick={() => handleDeleteRoomMessage(message)}
                            className="inline-flex items-center gap-1 rounded-full bg-black/15 px-2 py-1 text-red-200 transition-colors hover:bg-red-500/15"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </button>
                        )}
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
                      </div>
                    )}

                    <div className="mt-1 flex justify-end text-xs text-tx-muted">
                      {formatTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          <div className="relative z-10 p-3 md:p-4 bg-void/80 backdrop-blur-xl border-t border-bd-subtle">
            {editingMessage && (
              <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-accent/20 bg-accent/10 px-3 py-2 text-xs text-accent">
                <span className="truncate">Editing room message</span>
                <button
                  type="button"
                  onClick={cancelEditingMessage}
                  className="rounded-full px-2 py-1 text-white/70 transition hover:bg-white/10 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={cycleDisappearingTimer}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/75 transition-colors hover:bg-white/10"
                title="Cycle disappearing timer"
              >
                <Zap className="w-3.5 h-3.5 text-yellow-400" />
                <span>Disappear {activeTimerOption.shortLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewOnceNextFile((currentValue) => !currentValue)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  viewOnceNextFile
                    ? 'border-indigo-400/40 bg-indigo-500/20 text-indigo-100'
                    : 'border-white/10 bg-white/5 text-white/75 hover:bg-white/10'
                }`}
                title="Make the next room attachment view once"
              >
                <File className="w-3.5 h-3.5" />
                <span>{viewOnceNextFile ? 'Next file: view once' : 'Next file: reusable'}</span>
              </button>
            </div>

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileInput}
                className="hidden"
                accept="image/*,video/*,audio/*,application/pdf,text/plain"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={encryptionBlocked}
                className="rounded-2xl border border-white/10 bg-white/5 p-3 transition-all hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                title="Send encrypted file"
              >
                <Paperclip className="w-5 h-5 text-tx-primary" />
              </button>

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={messageInput}
                  onChange={handleTyping}
                  disabled={!editingMessage && encryptionBlocked}
                  placeholder={encryptionBlocked ? 'Import your key backup to send encrypted room messages' : editingMessage ? 'Edit room message' : 'Type a room message'}
                  className="w-full rounded-3xl border border-white/10 px-5 py-3.5 text-tx-primary placeholder-tx-muted focus:outline-none focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'rgba(15,23,42,0.8)' }}
                />
              </div>

              <button
                type="submit"
                disabled={!messageInput.trim() || (!editingMessage && encryptionBlocked)}
                className="rounded-2xl bg-accent text-void hover:brightness-110 p-3.5 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:brightness-110"
                title={editingMessage ? 'Save room message' : 'Send room message'}
              >
                {editingMessage ? <Pencil className="w-5 h-5" /> : <Send className="w-5 h-5" />}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-void min-w-0 relative overflow-hidden">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-accent/[0.03] blur-[100px] animate-pulse" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-emerald-neon/[0.02] blur-[80px] animate-pulse" style={{ animationDelay: '1s' }} />
          <div className="max-w-md px-6 text-center relative z-10">
            <div className="mx-auto mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-accent/[0.08] border border-accent/10">
              <Users className="h-20 w-20 text-accent/40" strokeWidth={1} />
            </div>
            <h3 className="text-2xl font-display font-semibold text-tx-primary tracking-tight">Encrypted Group Chats</h3>
            <p className="mt-3 text-sm leading-relaxed text-tx-muted">
              Create a project room, join public spaces, and keep the message body encrypted for the members in that room.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-tx-muted">
              <MessageCircle className="w-4 h-4" strokeWidth={1.5} />
              <span>Rooms update in real time with encrypted message bodies.</span>
            </div>
          </div>
        </div>
      )}

      <ForwardMessageDialog
        isOpen={Boolean(forwardingMessage)}
        excludeRoomId={selectedRoom?._id || null}
        excludeUserId={null}
        messagePreview={forwardingMessage ? getForwardPreviewText(forwardingMessage) : ''}
        onClose={() => setForwardingMessage(null)}
        onForward={handleForwardMessage}
      />
    </div>
  );
};

export default RoomsPage;
