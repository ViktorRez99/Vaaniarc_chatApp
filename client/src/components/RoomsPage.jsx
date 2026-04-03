import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  File,
  Globe,
  Lock,
  MessageCircle,
  Paperclip,
  Plus,
  Search,
  Send,
  Users,
  Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import socketService from '../services/socket';
import cryptoService from '../services/cryptoService';
import { idsEqual, normalizeId } from '../utils/identity';
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
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const selectedRoomRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    selectedRoomRef.current = selectedRoom;
  }, [selectedRoom]);

  useEffect(() => {
    void loadRooms();
    setupSocketListeners();

    const openGroupCreator = () => setShowCreateRoom(true);
    window.addEventListener('vaaniarc:open-group-creator', openGroupCreator);

    return () => {
      cleanupSocketListeners();
      window.removeEventListener('vaaniarc:open-group-creator', openGroupCreator);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!selectedRoom?._id) {
      setMessages([]);
      setTypingUsers(new Set());
      return undefined;
    }

    socketService.joinRoom(selectedRoom._id);
    void fetchRoomMessages(selectedRoom._id);

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

  const setupSocketListeners = () => {
    socketService.on('room_message', handleRoomMessage);
    socketService.on('user_typing_room', handleUserTypingRoom);
    socketService.on('user_stop_typing_room', handleUserStopTypingRoom);
  };

  const cleanupSocketListeners = () => {
    socketService.off('room_message', handleRoomMessage);
    socketService.off('user_typing_room', handleUserTypingRoom);
    socketService.off('user_stop_typing_room', handleUserStopTypingRoom);
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

    try {
      const tempId = `room-file-${Date.now()}`;
      const encryptedAttachment = await cryptoService.encryptAttachmentForUsers(
        file,
        getRoomMemberIds(selectedRoom)
      );

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
            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
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
            className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
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

  const encryptionBlocked = encryptionState?.status !== 'ready';
  const activeTimerOption = getDisappearingTimerOption(disappearingTimer);
  const cycleDisappearingTimer = () => {
    setDisappearingTimer((currentValue) => getNextDisappearingTimer(currentValue));
  };
  const typingText = typingUsers.size > 0
    ? `${Array.from(typingUsers).join(', ')} typing...`
    : `${selectedRoom?.members?.length || 0} member${selectedRoom?.members?.length === 1 ? '' : 's'}`;

  return (
    <div className="flex h-full bg-[#0b141a] overflow-hidden">
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
          <form onSubmit={handleCreateRoom} className="m-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
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
                      ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
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
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
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
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-[#0b141a]">
          <div className="absolute top-0 left-0 right-0 z-20 h-16 px-4 flex items-center justify-between border-b border-white/5 bg-slate-900/20 backdrop-blur-2xl">
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
                  : 'bg-gradient-to-br from-emerald-500 to-teal-600'
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

          <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-20 space-y-3 bg-[#0b141a]" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%230b141a\"/%3E%3Cpath d=\"M20 20h60v60H20z\" fill=\"%23121a22\" opacity=\".05\"/%3E%3C/svg%3E')", backgroundSize: '40px 40px' }}>
            <div className="flex justify-center">
              <div className="rounded-xl border border-white/5 bg-slate-900/50 px-4 py-2 shadow-sm">
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

            {(messages || []).map((message) => {
              const senderId = normalizeId(message?.sender?._id || message?.sender);
              const isOwn = idsEqual(senderId, user?._id || user?.id);
              const fileDetails = message?.decryptedFileMetadata || message?.content?.file?.decryptedMetadata || message?.content?.file;
              const hasAttachment = Boolean(message?.content?.file?.url || message?.fileUrl);

              return (
                <div
                  key={message._id}
                  className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] sm:max-w-[75%] md:max-w-[70%] rounded-lg px-3 py-2 shadow-md ${
                    isOwn
                      ? 'bg-[#005c4b] text-white rounded-br-none'
                      : 'bg-[#202c33] text-[#e9edef] rounded-bl-none'
                  }`}>
                    {!isOwn && (
                      <p className="mb-1 text-xs font-semibold text-emerald-300">
                        {message?.sender?.username || 'Member'}
                      </p>
                    )}

                    {hasAttachment ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadAttachment(message)}
                        className={`w-full flex items-center gap-3 rounded-md px-1 py-1 text-left transition-colors ${
                          isOwn ? 'hover:bg-white/10' : 'hover:bg-white/5'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          isOwn ? 'bg-white/15' : 'bg-black/20'
                        }`}>
                          <File className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="break-words font-medium">
                            {fileDetails?.originalName || message?.content?.text || 'Attachment'}
                          </p>
                          <p className="text-xs opacity-75">
                            {fileDetails?.size
                              ? `${Math.max(1, Math.round(fileDetails.size / 1024))} KB`
                              : 'Tap to download'}
                          </p>
                        </div>
                      </button>
                    ) : (
                      <p className="break-words">{message?.content?.text || ''}</p>
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

                    <div className="mt-1 flex justify-end text-xs text-[#8696a0]">
                      {formatTime(message.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 md:p-5 bg-[#0b141a]">
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
                <Paperclip className="w-5 h-5 text-[#e9edef]" />
              </button>

              <div className="flex-1 relative">
                <input
                  type="text"
                  value={messageInput}
                  onChange={handleTyping}
                  disabled={encryptionBlocked}
                  placeholder={encryptionBlocked ? 'Import your key backup to send encrypted room messages' : 'Type a room message'}
                  className="w-full rounded-3xl border border-white/10 px-5 py-3.5 text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'rgba(15,23,42,0.8)' }}
                />
              </div>

              <button
                type="submit"
                disabled={!messageInput.trim() || encryptionBlocked}
                className="rounded-2xl bg-[#00a884] p-3.5 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:bg-[#06cf9c]"
                title="Send room message"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#0b141a] min-w-0">
          <div className="max-w-md px-6 text-center">
            <div className="mx-auto mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-emerald-500/10">
              <Users className="h-20 w-20 text-emerald-300/60" />
            </div>
            <h3 className="text-3xl font-light text-[#e9edef]">Encrypted Group Chats</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8696a0]">
              Create a project room, join public spaces, and keep the message body encrypted for the members in that room.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#667781]">
              <MessageCircle className="w-4 h-4" />
              <span>Rooms update in real time with encrypted message bodies.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RoomsPage;
