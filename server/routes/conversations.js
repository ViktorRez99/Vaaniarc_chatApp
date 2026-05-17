const logger = require('../utils/logger');
const express = require('express');

const router = express.Router();
const Chat = require('../models/Chat');
const Room = require('../models/Room');
const Channel = require('../models/Channel');
const ChannelPost = require('../models/ChannelPost');
const User = require('../models/User');
const Message = require('../models/Message');
const PrivateMessage = require('../models/PrivateMessage');
const { arrayIncludesId, normalizeId } = require('../utils/idHelpers');
const { buildConversationId, parseConversationId } = require('../utils/conversationHelpers');
const {
  applyExpiredPrivateMessagePlaceholder,
  buildActiveMessageQuery,
  redactPrivateMessageForUser,
  redactRoomMessageForUser
} = require('../utils/messagePrivacy');

const DIRECT_MESSAGE_FIELDS = 'content encryptedContent protocolVersion senderDeviceId messageType fileUrl fileMetadata createdAt sender read readAt expiresInSeconds expiresAt isViewOnce viewedBy';
const GROUP_MESSAGE_FIELDS = 'content encryptedContent protocolVersion senderDeviceId messageType createdAt sender replyTo isDeleted expiresInSeconds expiresAt isViewOnce viewedBy';
const CHANNEL_POST_FIELDS = 'channel content messageType isPinned isEdited editedAt createdAt updatedAt author';

const serializePrivateMessage = (message) => ({
  id: message._id,
  createdAt: message.createdAt,
  sender: message.sender,
  content: message.content,
  encryptedContent: message.encryptedContent,
  protocolVersion: message.protocolVersion || 1,
  senderDeviceId: message.senderDeviceId || null,
  messageType: message.messageType,
  fileUrl: message.fileUrl,
  fileMetadata: message.fileMetadata,
  expiresInSeconds: message.expiresInSeconds || null,
  expiresAt: message.expiresAt || null,
  isViewOnce: Boolean(message.isViewOnce),
  isViewOnceConsumed: Boolean(message.isViewOnceConsumed),
  read: message.read,
  readAt: message.readAt
});

const serializeRoomMessage = (message) => ({
  id: message._id,
  createdAt: message.createdAt,
  sender: message.sender,
  content: message.content,
  encryptedContent: message.encryptedContent,
  protocolVersion: message.protocolVersion || 1,
  senderDeviceId: message.senderDeviceId || null,
  messageType: message.messageType,
  expiresInSeconds: message.expiresInSeconds || null,
  expiresAt: message.expiresAt || null,
  isViewOnce: Boolean(message.isViewOnce),
  isViewOnceConsumed: Boolean(message.isViewOnceConsumed),
  replyTo: message.replyTo,
  isDeleted: message.isDeleted
});

const serializeChannelPost = (post) => ({
  id: post._id,
  _id: post._id,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt,
  author: post.author,
  content: {
    text: post.content?.text || ''
  },
  messageType: post.messageType,
  isPinned: Boolean(post.isPinned),
  isEdited: Boolean(post.isEdited),
  editedAt: post.editedAt || null
});

const serializeDirectConversation = (chat, userId) => {
  const otherParticipant = chat.participants.find(
    (participant) => normalizeId(participant._id || participant.id) !== normalizeId(userId)
  ) || chat.participants[0];

  return {
    id: buildConversationId('direct', chat._id.toString()),
    type: 'direct',
    sourceId: chat._id,
    title: otherParticipant?.username || chat.name || 'Direct chat',
    avatar: otherParticipant?.avatar || null,
    updatedAt: chat.updatedAt,
    participants: chat.participants,
  lastMessage: chat.lastMessage
    ? serializePrivateMessage(
        redactPrivateMessageForUser(
          applyExpiredPrivateMessagePlaceholder(chat.lastMessage),
          userId
        )
      )
    : null
  };
};

const serializeGroupConversation = (room, userId, lastMessage = null) => ({
  id: buildConversationId('group', room._id.toString()),
  type: 'group',
  sourceId: room._id,
  title: room.name,
  description: room.description,
  visibility: room.type,
  avatar: null,
  updatedAt: room.lastActivity || room.updatedAt,
  participants: room.members,
  creator: room.creator,
  lastMessage: lastMessage ? serializeRoomMessage(redactRoomMessageForUser(lastMessage, userId)) : null
});

const serializeChannelConversation = (channel, lastPost = null) => ({
  id: buildConversationId('channel', channel._id.toString()),
  type: 'channel',
  sourceId: channel._id,
  title: channel.name,
  description: channel.description,
  visibility: channel.visibility,
  avatar: null,
  updatedAt: channel.lastActivity || channel.updatedAt,
  participants: channel.members,
  creator: channel.owner,
  community: channel.community || null,
  lastMessage: lastPost ? serializeChannelPost(lastPost) : null
});

router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user._id;

    const [chats, rooms, channels] = await Promise.all([
      Chat.find({ participants: userId })
        .populate('participants', 'username avatar status firstName lastName')
        .populate({
          path: 'lastMessage',
          select: DIRECT_MESSAGE_FIELDS
        })
        .sort({ updatedAt: -1 }),
      Room.find({ 'members.user': userId, isActive: true })
        .populate('creator', 'username avatar')
        .populate('members.user', 'username avatar status')
        .sort({ lastActivity: -1 }),
      Channel.find({ 'members.user': userId, isActive: true })
        .populate('owner', 'username avatar')
        .populate('members.user', 'username avatar status')
        .populate('community', 'name slug visibility')
        .sort({ lastActivity: -1 })
    ]);

    const [roomMessages, channelPosts] = await Promise.all([
      rooms.length > 0
        ? Message.find(buildActiveMessageQuery({ room: { $in: rooms.map((room) => room._id) }, isDeleted: false }))
            .select(`room ${GROUP_MESSAGE_FIELDS}`)
            .populate('sender', 'username avatar')
            .sort({ createdAt: -1 })
        : [],
      channels.length > 0
        ? ChannelPost.find({ channel: { $in: channels.map((channel) => channel._id) } })
            .select(`channel ${CHANNEL_POST_FIELDS}`)
            .populate('author', 'username avatar')
            .sort({ createdAt: -1 })
        : []
    ]);

    const latestRoomMessageByRoomId = new Map();
    roomMessages.forEach((message) => {
      const roomId = normalizeId(message.room);
      if (!latestRoomMessageByRoomId.has(roomId)) {
        latestRoomMessageByRoomId.set(roomId, message);
      }
    });

    const latestChannelPostByChannelId = new Map();
    channelPosts.forEach((post) => {
      const channelId = normalizeId(post.channel);
      if (!latestChannelPostByChannelId.has(channelId)) {
        latestChannelPostByChannelId.set(channelId, post);
      }
    });

    const conversations = [
      ...chats.map((chat) => serializeDirectConversation(chat, userId)),
      ...rooms.map((room) =>
        serializeGroupConversation(room, userId, latestRoomMessageByRoomId.get(normalizeId(room._id)) || null)
      ),
      ...channels.map((channel) =>
        serializeChannelConversation(channel, latestChannelPostByChannelId.get(normalizeId(channel._id)) || null)
      )
    ].sort((left, right) => {
      const leftTimestamp = new Date(left.lastMessage?.createdAt || left.updatedAt || 0).getTime();
      const rightTimestamp = new Date(right.lastMessage?.createdAt || right.updatedAt || 0).getTime();
      return rightTimestamp - leftTimestamp;
    });

    res.json({ conversations });
  } catch (error) {
    logger.error('Conversation fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch conversations' });
  }
});

router.post('/conversations', async (req, res) => {
  try {
    const { type, recipientId, name, description = '', visibility = 'private', maxMembers = 100 } = req.body;
    const userId = req.user._id;

    if (type === 'direct') {
      if (!recipientId) {
        return res.status(400).json({ message: 'Recipient ID is required' });
      }

      const recipient = await User.findById(recipientId);
      if (!recipient) {
        return res.status(404).json({ message: 'User not found' });
      }

      let chat = await Chat.findOne({
        type: 'private',
        participants: { $all: [userId, recipientId], $size: 2 }
      })
        .populate('participants', 'username avatar status firstName lastName')
        .populate({
          path: 'lastMessage',
          select: DIRECT_MESSAGE_FIELDS
        });

      if (!chat) {
        chat = await Chat.create({
          participants: [userId, recipientId],
          type: 'private'
        });

        chat = await Chat.findById(chat._id)
          .populate('participants', 'username avatar status firstName lastName')
          .populate({
            path: 'lastMessage',
            select: DIRECT_MESSAGE_FIELDS
          });
      }

      return res.json({
        conversation: serializeDirectConversation(chat, userId)
      });
    }

    if (type === 'group') {
      if (!name || name.trim().length === 0) {
        return res.status(400).json({ message: 'Group name is required' });
      }

      if (!['public', 'private'].includes(visibility)) {
        return res.status(400).json({ message: 'Invalid group visibility' });
      }

      const room = await Room.create({
        name: name.trim(),
        description: description.trim(),
        type: visibility,
        creator: userId,
        maxMembers,
        members: [{
          user: userId,
          role: 'admin',
          joinedAt: new Date()
        }],
        admins: [userId]
      });

      await room.populate('creator', 'username avatar');
      await room.populate('members.user', 'username avatar status');

      return res.status(201).json({
        conversation: serializeGroupConversation(room, userId)
      });
    }

    return res.status(400).json({ message: 'Conversation type must be direct or group. Create channels via /api/channels.' });
  } catch (error) {
    logger.error('Conversation creation error:', error);
    res.status(500).json({ message: 'Failed to create conversation' });
  }
});

router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user._id;
    const parsedConversation = parseConversationId(conversationId);

    if (!parsedConversation) {
      return res.status(400).json({ message: 'Invalid conversation id' });
    }

    const messageLimit = Number.parseInt(limit, 10) || 50;

    if (parsedConversation.type === 'direct') {
      const chat = await Chat.findById(parsedConversation.sourceId);
      if (!chat) {
        return res.status(404).json({ message: 'Chat not found' });
      }

      if (!arrayIncludesId(chat.participants, userId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const query = buildActiveMessageQuery({ chatId: chat._id });
      if (before) {
        query.$and.push({
          createdAt: { $lt: new Date(before) }
        });
      }

      const messages = await PrivateMessage.find(query)
        .populate('sender', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(messageLimit);

      return res.json({
        conversationId,
        messages: messages.reverse().map((message) => serializePrivateMessage(redactPrivateMessageForUser(message, userId)))
      });
    }

    if (parsedConversation.type === 'group') {
      const room = await Room.findById(parsedConversation.sourceId);
      if (!room || !room.isActive) {
        return res.status(404).json({ message: 'Room not found' });
      }

      if (room.type === 'private' && !room.isMember(userId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const query = buildActiveMessageQuery({
        room: room._id,
        isDeleted: false
      });

      if (before) {
        query.$and.push({
          createdAt: { $lt: new Date(before) }
        });
      }

      const messages = await Message.find(query)
        .populate('sender', 'username avatar')
        .populate('replyTo', 'content sender')
        .sort({ createdAt: -1 })
        .limit(messageLimit);

      return res.json({
        conversationId,
        messages: messages.reverse().map((message) => serializeRoomMessage(redactRoomMessageForUser(message, userId)))
      });
    }

    const channel = await Channel.findById(parsedConversation.sourceId);
    if (!channel || !channel.isActive) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.canView(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const channelQuery = { channel: channel._id };
    if (before) {
      channelQuery.createdAt = { $lt: new Date(before) };
    }

    const posts = await ChannelPost.find(channelQuery)
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(messageLimit);

    return res.json({
      conversationId,
      messages: posts.reverse().map(serializeChannelPost)
    });
  } catch (error) {
    logger.error('Conversation messages error:', error);
    res.status(500).json({ message: 'Failed to fetch conversation messages' });
  }
});

module.exports = router;
