require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const fileAccessRoutes = require('./routes/fileAccess');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const roomRoutes = require('./routes/room');
const conversationRoutes = require('./routes/conversations');
const channelRoutes = require('./routes/channel');
const communityRoutes = require('./routes/community');
const meetingRoutes = require('./routes/meeting');
const keysRoutes = require('./routes/keys');
const notificationRoutes = require('./routes/notifications');
const twoFactorRoutes = require('./routes/2fa');
const deviceRoutes = require('./routes/devices');
const healthRoutes = require('./routes/health');

const authenticateToken = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
const socketAuth = require('./middleware/socketAuth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { enqueueBackgroundJob } = require('./services/backgroundJobs');
const cacheService = require('./services/cacheService');
const { configureSocketAdapter } = require('./services/socketAdapter');
const logger = require('./utils/logger');
const { arrayIncludesId, normalizeId } = require('./utils/idHelpers');
const { validateDeviceBoundPayload } = require('./utils/e2eePayloads');
const { emitToDeviceRooms, resolveAuthorizedDeviceIds } = require('./utils/deviceDelivery');
const { findExistingPrivateMessage, findExistingRoomMessage } = require('./utils/messageIdempotency');
const { buildPrivacyFields } = require('./utils/messagePrivacy');
const { resolveStoredTextContent } = require('./utils/secureMessaging');
const { emitSocketEvent, unpackSocketPayload } = require('./utils/socketPayloads');
const {
  populatePrivateMessage,
  serializePrivateMessageForUser
} = require('./utils/privateMessageFormatting');
const {
  buildDirectMessagePayload,
  buildRoomMessagePayload,
  sendNotificationsToUserIds
} = require('./services/pushService');

const app = express();
const requireCsrf = authenticateToken.requireCsrf;
const parseOriginList = (value) => String(value || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([
  ...parseOriginList(process.env.ALLOWED_ORIGINS),
  process.env.FRONTEND_URL,
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174'
].filter(Boolean))];
const isDevelopment = process.env.NODE_ENV !== 'production';
const isAllowedOrigin = (origin) => !origin || allowedOrigins.includes(origin);
const toWebSocketOrigin = (origin) => origin.startsWith('https://')
  ? origin.replace(/^https:/, 'wss:')
  : origin.replace(/^http:/, 'ws:');
const cspConnectSources = [...new Set([
  "'self'",
  ...allowedOrigins,
  ...allowedOrigins.map(toWebSocketOrigin)
])];
const server = http.createServer(app);

app.set('trust proxy', 1);

const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'));
    },
    credentials: true
  },
  pingTimeout: 15000,
  pingInterval: 30000
});

app.set('io', io);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: cspConnectSources,
      fontSrc: ["'self'", 'data:'],
      frameAncestors: ["'self'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      scriptSrc: isDevelopment
        ? ["'self'", "'unsafe-eval'", "'unsafe-inline'"]
        : ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      workerSrc: ["'self'", 'blob:']
    }
  },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  referrerPolicy: { policy: 'same-origin' }
}));

app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Origin not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(fileAccessRoutes);

if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp', {
    maxPoolSize: Number.parseInt(process.env.MONGODB_MAX_POOL_SIZE || '50', 10),
    minPoolSize: Number.parseInt(process.env.MONGODB_MIN_POOL_SIZE || '5', 10),
    serverSelectionTimeoutMS: Number.parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '5000', 10)
  })
    .then(() => logger.info('Connected to MongoDB'))
    .catch(err => logger.error('MongoDB connection error', err));
}

const User = require('./models/User');
const PrivateMessage = require('./models/PrivateMessage');
const Chat = require('./models/Chat');
const Room = require('./models/Room');
const Channel = require('./models/Channel');
const Message = require('./models/Message');
const Meeting = require('./models/Meeting');

const isMeetingParticipant = (meeting, userId) => {
  if (!meeting || !userId) {
    return false;
  }

  const normalizedUserId = userId.toString();

  return meeting.host?.toString() === normalizedUserId
    || meeting.participants.some(
      (participant) => participant.user?.toString() === normalizedUserId && !participant.leftAt
    );
};

const loadMeetingForSocket = async (meetingId, userId) => {
  const meeting = await Meeting.findOne({ meetingId });

  if (!meeting || !isMeetingParticipant(meeting, userId)) {
    return null;
  }

  return meeting;
};

const emitToUserRooms = ({ ioInstance, eventName, payload, userIds = [] }) => {
  [...new Set(userIds.map((userId) => normalizeId(userId)).filter(Boolean))].forEach((targetUserId) => {
    emitSocketEvent(ioInstance.to(`user:${targetUserId}`), eventName, payload);
  });
};

io.use(socketAuth);

io.on('connection', (socket) => {
  logger.info('User connected', { username: socket.user.username, socketId: socket.id });
  const userId = socket.user._id;
  const userSocketRoom = 'user:' + normalizeId(userId);
  const deviceSocketRoom = socket.deviceId ? 'device:' + socket.deviceId : null;

  User.findByIdAndUpdate(userId, { status: 'online' }).catch(err => logger.error('Status update error', err));

  socket.broadcast.emit('user_online', {
    userId,
    username: socket.user.username,
    avatar: socket.user.avatar
  });

  socket.join(userSocketRoom);
  if (deviceSocketRoom) {
    socket.join(deviceSocketRoom);
  }

  if (socket.device) {
    socket.device.lastActive = new Date();
    socket.device.lastIp = socket.handshake.address || socket.device.lastIp;
    socket.device.save().catch((err) => logger.error('Device activity update error', err));
  }

  socket.on('private_message', async (data) => {
    try {
      const decodedPayload = unpackSocketPayload(data) || {};
      const {
        chatId,
        content,
        messageType = 'text',
        fileUrl,
        encryptedContent,
        expiresInSeconds,
        replyTo,
        tempId
      } = decodedPayload;
      const storedContent = resolveStoredTextContent({
        plaintext: content,
        encryptedContent
      });
      const payloadValidation = validateDeviceBoundPayload({
        encryptedContent,
        authenticatedDeviceId: socket.deviceId || null,
        requireSelfEnvelope: true
      });
      const { protocolVersion, senderDeviceId, targetDeviceIds } = payloadValidation;
      const chat = await Chat.findById(chatId);
      if (!chat || !arrayIncludesId(chat.participants, userId)) {
        return socket.emit('error', { message: 'Invalid chat' });
      }

      if (!payloadValidation.isValid) {
        return socket.emit('error', { message: payloadValidation.error });
      }

      if (replyTo) {
        const replyMessage = await PrivateMessage.findOne({ _id: replyTo, chatId });
        if (!replyMessage) {
          return socket.emit('error', { message: 'Reply target not found in this chat' });
        }
      }

      if (!storedContent && !fileUrl) {
        return socket.emit('error', { message: 'Message content is required' });
      }

      let authorizedTargetDeviceIds = [];
      if (protocolVersion >= 2) {
        authorizedTargetDeviceIds = await resolveAuthorizedDeviceIds({
          userIds: chat.participants,
          deviceIds: targetDeviceIds
        });

        if (authorizedTargetDeviceIds.length !== targetDeviceIds.length) {
          return socket.emit('error', { message: 'Encrypted payload targets unauthorized devices' });
        }
      }

      const existingMessage = await findExistingPrivateMessage({
        chatId,
        senderId: userId,
        tempId
      });
      if (existingMessage) {
        await populatePrivateMessage(existingMessage);
        const existingPayload = serializePrivateMessageForUser(existingMessage, userId);
        return emitSocketEvent(socket, 'message_sent', {
          ...existingPayload,
          tempId: tempId || existingPayload.tempId || null
        });
      }

      const privacyFields = buildPrivacyFields({
        expiresInSeconds,
        isViewOnce: false
      });

      const message = new PrivateMessage({
        chatId,
        sender: userId,
        content: storedContent,
        encryptedContent,
        protocolVersion,
        senderDeviceId: senderDeviceId || socket.deviceId || null,
        tempId: tempId || null,
        messageType,
        fileUrl,
        replyTo: replyTo || null,
        ...privacyFields
      });
      await message.save();

      chat.lastMessage = message._id;
      chat.updatedAt = new Date();
      await chat.save();

      await populatePrivateMessage(message);
      const outgoingMessage = message.toObject();

      if (protocolVersion >= 2 && authorizedTargetDeviceIds.length) {
        if (socket.deviceId) {
          emitSocketEvent(socket.to('device:' + socket.deviceId), 'private_message', outgoingMessage);
        }

        emitToDeviceRooms({
          io,
          eventName: 'private_message',
          payload: outgoingMessage,
          deviceIds: authorizedTargetDeviceIds,
          excludeDeviceId: socket.deviceId || null
        });
      } else {
        emitToUserRooms({
          ioInstance: io,
          eventName: 'private_message',
          payload: outgoingMessage,
          userIds: chat.participants.filter((participantId) => !arrayIncludesId([participantId], userId))
        });
        emitSocketEvent(socket.to(userSocketRoom), 'private_message', outgoingMessage);
      }

      emitSocketEvent(socket, 'message_sent', { ...outgoingMessage, tempId: tempId || null });

      enqueueBackgroundJob('push-direct-message-notifications', () => sendNotificationsToUserIds({
        io,
        userIds: chat.participants,
        excludeUserIds: [userId],
        payloadBuilder: () => buildDirectMessagePayload({
          sender: socket.user,
          message: outgoingMessage
        })
      }));
    } catch (error) {
      logger.error('Private message error', error);
      socket.emit('error', {
        message: String(error.message || '').toLowerCase().includes('plaintext content')
          ? error.message
          : 'Failed to send message'
      });
    }
  });

  socket.on('typing_start', async (data) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);
      if (chat && arrayIncludesId(chat.participants, userId)) {
        chat.participants.forEach(participantId => {
          if (!arrayIncludesId([participantId], userId)) {
            io.to('user:' + normalizeId(participantId)).emit('user_typing', { chatId, userId, username: socket.user.username });
          }
        });
      }
    } catch (error) {
      logger.error('Typing indicator error', error);
    }
  });

  socket.on('typing_stop', async (data) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);
      if (chat && arrayIncludesId(chat.participants, userId)) {
        chat.participants.forEach(participantId => {
          if (!arrayIncludesId([participantId], userId)) {
            io.to('user:' + normalizeId(participantId)).emit('user_stop_typing', { chatId, userId });
          }
        });
      }
    } catch (error) {
      logger.error('Typing stop error', error);
    }
  });

  socket.on('start_call_request', async (data) => {
    try {
      const { chatId, callType = 'audio' } = data;
      const chat = await Chat.findById(chatId);
      if (!chat || !arrayIncludesId(chat.participants, userId)) return;

      chat.participants.forEach(participantId => {
        if (!arrayIncludesId([participantId], userId)) {
          io.to('user:' + normalizeId(participantId)).emit('incoming_call', {
            chatId,
            callType,
            from: { _id: userId, username: socket.user.username, avatar: socket.user.avatar }
          });
        }
      });
      socket.emit('call_request_sent', { chatId, callType });
    } catch (err) {
      logger.error('Call request error', err);
    }
  });

  socket.on('mark_read', async (data) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);
      if (chat && arrayIncludesId(chat.participants, userId)) {
        await PrivateMessage.updateMany(
          { chatId, sender: { $ne: userId }, read: false },
          { read: true, readAt: new Date() }
        );
        chat.participants.forEach(participantId => {
          if (!arrayIncludesId([participantId], userId)) {
            io.to('user:' + normalizeId(participantId)).emit('messages_read', { chatId, readBy: userId });
          }
        });
      }
    } catch (error) {
      logger.error('Mark read error', error);
    }
  });

  socket.on('private_message_reaction', async (data) => {
    try {
      const { chatId, messageId, emoji } = data;
      const trimmedEmoji = typeof emoji === 'string' ? emoji.trim() : '';

      if (!chatId || !messageId || !trimmedEmoji) {
        return socket.emit('error', { message: 'Chat, message, and emoji are required' });
      }

      const chat = await Chat.findById(chatId);
      if (!chat || !arrayIncludesId(chat.participants, userId)) {
        return socket.emit('error', { message: 'Invalid chat' });
      }

      const message = await PrivateMessage.findOne({ _id: messageId, chatId });
      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      const alreadyReacted = Array.isArray(message.reactions) && message.reactions.some(
        (reaction) => reaction.user.toString() === userId.toString() && reaction.emoji === trimmedEmoji
      );

      if (alreadyReacted) {
        message.removeReaction(userId, trimmedEmoji);
      } else {
        message.addReaction(userId, trimmedEmoji);
      }

      await message.save();
      await populatePrivateMessage(message);

      emitToUserRooms({
        ioInstance: io,
        eventName: 'private_message_reaction',
        payload: {
          chatId,
          message: message.toObject()
        },
        userIds: chat.participants
      });
    } catch (error) {
      logger.error('Private reaction error', error);
      socket.emit('error', { message: 'Failed to update reaction' });
    }
  });

  socket.on('private_message_edit', async (data) => {
    try {
      const { chatId, messageId, content } = data;
      const trimmedContent = typeof content === 'string' ? content.trim() : '';

      if (!chatId || !messageId || !trimmedContent) {
        return socket.emit('error', { message: 'Chat, message, and content are required' });
      }

      if (trimmedContent.length > 2000) {
        return socket.emit('error', { message: 'Edited message must be 2000 characters or less' });
      }

      const chat = await Chat.findById(chatId);
      if (!chat || !arrayIncludesId(chat.participants, userId)) {
        return socket.emit('error', { message: 'Invalid chat' });
      }

      const message = await PrivateMessage.findOne({ _id: messageId, chatId });
      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      if (!message.canEdit(userId)) {
        return socket.emit('error', { message: 'This message can no longer be edited' });
      }

      if (message.encryptedContent || Number(message.protocolVersion || 1) >= 2) {
        return socket.emit('error', { message: 'Secure messages cannot be edited in place' });
      }

      message.editContent(trimmedContent);
      await message.save();
      await populatePrivateMessage(message);

      emitToUserRooms({
        ioInstance: io,
        eventName: 'private_message_edit',
        payload: {
          chatId,
          message: message.toObject()
        },
        userIds: chat.participants
      });
    } catch (error) {
      logger.error('Private edit error', error);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  socket.on('private_message_delete', async (data) => {
    try {
      const { chatId, messageId } = data;

      if (!chatId || !messageId) {
        return socket.emit('error', { message: 'Chat and message are required' });
      }

      const chat = await Chat.findById(chatId);
      if (!chat || !arrayIncludesId(chat.participants, userId)) {
        return socket.emit('error', { message: 'Invalid chat' });
      }

      const message = await PrivateMessage.findOne({ _id: messageId, chatId });
      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      if (!message.canDelete(userId)) {
        return socket.emit('error', { message: 'This message can no longer be deleted' });
      }

      message.softDelete();
      await message.save();
      await populatePrivateMessage(message);

      emitToUserRooms({
        ioInstance: io,
        eventName: 'private_message_delete',
        payload: {
          chatId,
          message: message.toObject()
        },
        userIds: chat.participants
      });
    } catch (error) {
      logger.error('Private delete error', error);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  socket.on('join_room', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);
      if (room && room.isMember(userId)) {
        socket.join('room:' + roomId);
        socket.to('room:' + roomId).emit('user_joined_room', {
          roomId, userId, username: socket.user.username, avatar: socket.user.avatar
        });
      }
    } catch (error) {
      logger.error('Join room error', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('leave_room', async (data) => {
    try {
      const { roomId } = data;
      socket.leave('room:' + roomId);
      socket.to('room:' + roomId).emit('user_left_room', { roomId, userId, username: socket.user.username });
    } catch (error) {
      logger.error('Leave room error', error);
    }
  });

  socket.on('join_channel', async (data) => {
    try {
      const { channelId } = data;
      const channel = await Channel.findById(channelId);

      if (channel && channel.isActive && channel.canView(userId)) {
        socket.join('channel:' + normalizeId(channelId));
      } else {
        socket.emit('error', { message: 'Channel access denied' });
      }
    } catch (error) {
      logger.error('Join channel error', error);
      socket.emit('error', { message: 'Failed to join channel' });
    }
  });

  socket.on('leave_channel', async (data) => {
    try {
      const { channelId } = data;
      socket.leave('channel:' + normalizeId(channelId));
    } catch (error) {
      logger.error('Leave channel error', error);
    }
  });

  socket.on('room_message', async (data) => {
    try {
      const decodedPayload = unpackSocketPayload(data) || {};
      const { roomId, content, messageType = 'text', replyTo, encryptedContent, tempId, expiresInSeconds } = decodedPayload;
      const storedText = resolveStoredTextContent({
        plaintext: content,
        encryptedContent
      });
      const payloadValidation = validateDeviceBoundPayload({
        encryptedContent,
        authenticatedDeviceId: socket.deviceId || null,
        requireSelfEnvelope: true
      });
      const { protocolVersion, senderDeviceId, targetDeviceIds } = payloadValidation;
      const room = await Room.findById(roomId);
      if (!room || !room.isMember(userId)) {
        return socket.emit('error', { message: 'Invalid room or access denied' });
      }

      if (!payloadValidation.isValid) {
        return socket.emit('error', { message: payloadValidation.error });
      }

      if (!storedText) {
        return socket.emit('error', { message: 'Message content cannot be empty' });
      }

      let authorizedTargetDeviceIds = [];
      if (protocolVersion >= 2) {
        authorizedTargetDeviceIds = await resolveAuthorizedDeviceIds({
          userIds: room.members.map((member) => member.user),
          deviceIds: targetDeviceIds
        });

        if (authorizedTargetDeviceIds.length !== targetDeviceIds.length) {
          return socket.emit('error', { message: 'Encrypted payload targets unauthorized devices' });
        }
      }

      const existingMessage = await findExistingRoomMessage({
        roomId,
        senderId: userId,
        tempId
      });
      if (existingMessage) {
        await existingMessage.populate('sender', 'username avatar');
        if (existingMessage.replyTo) {
          await existingMessage.populate('replyTo', 'content sender');
        }
        return emitSocketEvent(socket, 'room_message', {
          ...existingMessage.toObject(),
          tempId: tempId || existingMessage.tempId || null
        });
      }

      const privacyFields = buildPrivacyFields({
        expiresInSeconds,
        isViewOnce: false
      });

      const message = new Message({
        sender: userId,
        room: roomId,
        content: { text: storedText },
        encryptedContent,
        protocolVersion,
        senderDeviceId: senderDeviceId || socket.deviceId || null,
        messageType,
        isPrivate: false,
        replyTo: replyTo || null,
        tempId: tempId || null,
        ...privacyFields
      });
      await message.save();
      await room.updateActivity();
      await message.populate('sender', 'username avatar');
      if (replyTo) await message.populate('replyTo', 'content sender');
      const outgoingMessage = { ...message.toObject(), tempId };

      if (protocolVersion >= 2 && authorizedTargetDeviceIds.length) {
        emitSocketEvent(socket, 'room_message', outgoingMessage);
        if (socket.deviceId) {
          emitSocketEvent(socket.to('device:' + socket.deviceId), 'room_message', outgoingMessage);
        }
        emitToDeviceRooms({
          io,
          eventName: 'room_message',
          payload: outgoingMessage,
          deviceIds: authorizedTargetDeviceIds,
          excludeDeviceId: socket.deviceId || null
        });
      } else {
        emitSocketEvent(io.to('room:' + roomId), 'room_message', outgoingMessage);
      }

      enqueueBackgroundJob('push-room-message-notifications', () => sendNotificationsToUserIds({
        io,
        userIds: room.members.map((member) => member.user),
        excludeUserIds: [userId],
        payloadBuilder: () => buildRoomMessagePayload({
          sender: socket.user,
          room,
          message: outgoingMessage
        })
      }));
    } catch (error) {
      logger.error('Room message error', error);
      socket.emit('error', {
        message: String(error.message || '').toLowerCase().includes('plaintext content')
          ? error.message
          : 'Failed to send message'
      });
    }
  });

  socket.on('room_typing_start', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);
      if (room && room.isMember(userId)) {
        socket.to('room:' + roomId).emit('user_typing_room', { roomId, userId, username: socket.user.username });
      }
    } catch (error) {
      logger.error('Room typing indicator error', error);
    }
  });

  socket.on('room_typing_stop', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);
      if (room && room.isMember(userId)) {
        socket.to('room:' + roomId).emit('user_stop_typing_room', { roomId, userId });
      }
    } catch (error) {
      logger.error('Room typing stop error', error);
    }
  });

  socket.on('join_meeting', async (data) => {
    try {
      const { meetingId } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);

      if (!meeting) {
        return socket.emit('error', { message: 'Meeting access denied' });
      }

      socket.join('meeting:' + meetingId);
      socket.to('meeting:' + meetingId).emit('user_joined_meeting', {
        userId,
        username: socket.user.username,
        avatar: socket.user.avatar,
        deviceId: socket.deviceId || null
      });
    } catch (error) {
      logger.error('Join meeting error', error);
      socket.emit('error', { message: 'Failed to join meeting' });
    }
  });

  socket.on('leave_meeting', async (data) => {
    try {
      const { meetingId } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);

      if (!meeting) {
        return;
      }

      socket.leave('meeting:' + meetingId);
      socket.to('meeting:' + meetingId).emit('user_left_meeting', {
        userId,
        username: socket.user.username,
        deviceId: socket.deviceId || null
      });
    } catch (error) {
      logger.error('Leave meeting error', error);
    }
  });

  socket.on('webrtc_offer', async (data) => {
    try {
      const { meetingId, offer, to } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);

      if (!meeting || !isMeetingParticipant(meeting, to)) {
        return socket.emit('error', { message: 'Meeting signaling access denied' });
      }

      io.to('user:' + normalizeId(to)).emit('webrtc_offer', {
        from: userId,
        fromDeviceId: socket.deviceId || null,
        offer,
        meetingId
      });
    } catch (error) {
      logger.error('WebRTC offer error', error);
      socket.emit('error', { message: 'Failed to forward WebRTC offer' });
    }
  });

  socket.on('webrtc_answer', async (data) => {
    try {
      const { meetingId, answer, to } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);

      if (!meeting || !isMeetingParticipant(meeting, to)) {
        return socket.emit('error', { message: 'Meeting signaling access denied' });
      }

      io.to('user:' + normalizeId(to)).emit('webrtc_answer', {
        from: userId,
        fromDeviceId: socket.deviceId || null,
        answer,
        meetingId
      });
    } catch (error) {
      logger.error('WebRTC answer error', error);
      socket.emit('error', { message: 'Failed to forward WebRTC answer' });
    }
  });

  socket.on('webrtc_ice_candidate', async (data) => {
    try {
      const { meetingId, candidate, to } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);

      if (!meeting || !isMeetingParticipant(meeting, to)) {
        return socket.emit('error', { message: 'Meeting signaling access denied' });
      }

      io.to('user:' + normalizeId(to)).emit('webrtc_ice_candidate', {
        from: userId,
        fromDeviceId: socket.deviceId || null,
        candidate,
        meetingId
      });
    } catch (error) {
      logger.error('WebRTC ICE candidate error', error);
      socket.emit('error', { message: 'Failed to forward ICE candidate' });
    }
  });

  socket.on('toggle_audio', async (data) => {
    try {
      const { meetingId, enabled } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);
      if (!meeting) {
        return;
      }

      socket.to('meeting:' + meetingId).emit('user_toggle_audio', {
        userId,
        enabled,
        deviceId: socket.deviceId || null
      });
    } catch (error) {
      logger.error('Toggle audio error', error);
    }
  });

  socket.on('toggle_video', async (data) => {
    try {
      const { meetingId, enabled } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);
      if (!meeting) {
        return;
      }

      socket.to('meeting:' + meetingId).emit('user_toggle_video', {
        userId,
        enabled,
        deviceId: socket.deviceId || null
      });
    } catch (error) {
      logger.error('Toggle video error', error);
    }
  });

  socket.on('screen_share', async (data) => {
    try {
      const { meetingId, enabled } = data;
      const meeting = await loadMeetingForSocket(meetingId, userId);
      if (!meeting) {
        return;
      }

      socket.to('meeting:' + meetingId).emit('user_screen_share', {
        userId,
        enabled,
        deviceId: socket.deviceId || null
      });
    } catch (error) {
      logger.error('Screen share error', error);
    }
  });

  socket.on('disconnect', async () => {
    logger.info('User disconnected', { username: socket.user.username, socketId: socket.id });
    await User.findByIdAndUpdate(userId, { status: 'offline', lastSeen: new Date() }).catch(err => logger.error('Disconnect status update error', err));
    socket.broadcast.emit('user_offline', { userId, username: socket.user.username });
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/2fa', twoFactorRoutes);
app.use('/api/keys', keysRoutes);
// Public health checks (must be before any app.use('/api', authenticateToken, ...))
app.use('/api', healthRoutes);
app.use('/api', apiLimiter);
app.use('/api/devices', authenticateToken, requireCsrf, deviceRoutes);
app.use('/api', authenticateToken, requireCsrf, notificationRoutes);
app.use('/api/upload', authenticateToken, requireCsrf, uploadRoutes);
app.use('/api', authenticateToken, requireCsrf, communityRoutes);
app.use('/api', authenticateToken, requireCsrf, channelRoutes);
app.use('/api', authenticateToken, requireCsrf, conversationRoutes);
app.use('/api', authenticateToken, requireCsrf, chatRoutes);
app.use('/api', authenticateToken, requireCsrf, roomRoutes);
app.use('/api', authenticateToken, requireCsrf, meetingRoutes);

app.use('/api/*', notFoundHandler);
app.use(errorHandler);

app.get('/', (req, res) => {
  res.json({
    message: 'VaaniArc API Server',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/auth',
      chats: '/api/chats',
      conversations: '/api/conversations',
      channels: '/api/channels',
      communities: '/api/communities',
      rooms: '/api/rooms',
      upload: '/api/upload',
      meetings: '/api/meetings',
      keys: '/api/keys',
      notifications: '/api/notifications',
      twoFactor: '/api/2fa',
      devices: '/api/devices',
      health: '/api/health'
    }
  });
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  await cacheService.connect();
  await configureSocketAdapter(io);

  server.listen(PORT, () => {
    logger.info('Server running on port ' + PORT);
    logger.info('Environment: ' + (process.env.NODE_ENV || 'development'));
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((error) => {
    logger.error('Server startup failed', error);
    process.exitCode = 1;
  });
}

module.exports = { app, server, io };
