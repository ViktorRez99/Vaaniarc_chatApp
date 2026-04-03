const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const PrivateMessage = require('../models/PrivateMessage');
const User = require('../models/User');
const cacheService = require('../services/cacheService');
const { arrayIncludesId } = require('../utils/idHelpers');
const { validateDeviceBoundPayload } = require('../utils/e2eePayloads');
const { emitToDeviceRooms, resolveAuthorizedDeviceIds } = require('../utils/deviceDelivery');
const { findExistingPrivateMessage } = require('../utils/messageIdempotency');
const { enqueueBackgroundJob } = require('../services/backgroundJobs');
const {
  PRIVATE_MESSAGE_SELECT,
  populatePrivateMessage,
  serializePrivateMessageForUser,
  serializePrivateMessagesForUser
} = require('../utils/privateMessageFormatting');
const {
  buildDirectMessagePayload,
  sendNotificationsToUserIds
} = require('../services/pushService');
const { emitSocketEvent } = require('../utils/socketPayloads');
const {
  buildActiveMessageQuery,
  buildPrivacyFields,
  markViewOnceConsumed,
  redactPrivateMessageForUser
} = require('../utils/messagePrivacy');
const {
  resolveStoredTextContent
} = require('../utils/secureMessaging');

const emitPrivateMessageEvent = (req, chat, eventName, payload) => {
  const io = req.app.get('io');
  if (!io || !chat?.participants?.length) {
    return;
  }

  chat.participants.forEach((participantId) => {
    emitSocketEvent(io.to(`user:${participantId.toString()}`), eventName, payload);
  });
};

// Get all chats for the authenticated user
router.get('/chats', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'username avatar status')
      .populate({
        path: 'lastMessage',
        select: PRIVATE_MESSAGE_SELECT
      })
      .sort({ updatedAt: -1 });

    res.json(chats.map((chat) => {
      const nextChat = chat.toObject();
      if (!nextChat.lastMessage) {
        return nextChat;
      }

      nextChat.lastMessage = serializePrivateMessageForUser(nextChat.lastMessage, userId);

      return nextChat;
    }));
  } catch (error) {
    console.error('Error fetching chats:', error);
    res.status(500).json({ message: 'Failed to fetch chats' });
  }
});

// Get or create a chat with a specific user
router.post('/chats', async (req, res) => {
  try {
    const { recipientId } = req.body;
    const userId = req.user._id;

    if (!recipientId) {
      return res.status(400).json({ message: 'Recipient ID is required' });
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId);
    if (!recipient) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if chat already exists
    let chat = await Chat.findOne({
      type: 'private',
      participants: { $all: [userId, recipientId], $size: 2 }
    })
      .populate('participants', 'username avatar status')
      .populate({
        path: 'lastMessage',
        select: PRIVATE_MESSAGE_SELECT
      });

    // Create new chat if it doesn't exist
    if (!chat) {
      chat = new Chat({
        participants: [userId, recipientId],
        type: 'private'
      });
      await chat.save();
      
      // Populate after saving
      chat = await Chat.findById(chat._id)
        .populate('participants', 'username avatar status')
        .populate({
          path: 'lastMessage',
          select: PRIVATE_MESSAGE_SELECT
        });
    }

    const nextChat = chat.toObject();
    if (nextChat.lastMessage) {
      nextChat.lastMessage = serializePrivateMessageForUser(nextChat.lastMessage, userId);
    }

    res.json(nextChat);
  } catch (error) {
    console.error('Error creating chat:', error);
    res.status(500).json({ message: 'Failed to create chat' });
  }
});

// Get messages for a specific chat
router.get('/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user._id;

    // Verify user is part of the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build query
    const query = buildActiveMessageQuery({ chatId });
    if (before) {
      query.$and.push({
        createdAt: { $lt: new Date(before) }
      });
    }

    const messages = await populatePrivateMessage(PrivateMessage.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit)));

    res.json(serializePrivateMessagesForUser(messages.reverse(), userId));
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// Send a message in a chat
router.post('/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const {
      content,
      encryptedContent,
      messageType = 'text',
      fileUrl,
      expiresInSeconds,
      isViewOnce,
      replyTo,
      tempId
    } = req.body;
    const userId = req.user._id;
    const storedContent = resolveStoredTextContent({
      plaintext: content,
      encryptedContent
    });
    const payloadValidation = validateDeviceBoundPayload({
      encryptedContent,
      authenticatedDeviceId: req.deviceId || null,
      requireSelfEnvelope: true
    });
    const { protocolVersion, senderDeviceId, targetDeviceIds } = payloadValidation;

    // Verify user is part of the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!payloadValidation.isValid) {
      return res.status(400).json({ message: payloadValidation.error });
    }

    if (protocolVersion >= 2) {
      const authorizedTargetDeviceIds = await resolveAuthorizedDeviceIds({
        userIds: chat.participants,
        deviceIds: targetDeviceIds
      });

      if (authorizedTargetDeviceIds.length !== targetDeviceIds.length) {
        return res.status(400).json({ message: 'The encrypted payload contains unauthorized target devices.' });
      }
    }

    if (replyTo) {
      const replyMessage = await PrivateMessage.findOne({ _id: replyTo, chatId });
      if (!replyMessage) {
        return res.status(404).json({ message: 'Reply target not found in this chat' });
      }
    }

    if (!storedContent && !fileUrl) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    const existingMessage = await findExistingPrivateMessage({
      chatId,
      senderId: userId,
      tempId
    });
    if (existingMessage) {
      await populatePrivateMessage(existingMessage);
      return res.json(serializePrivateMessageForUser(existingMessage, userId));
    }

    const privacyFields = buildPrivacyFields({
      expiresInSeconds,
      isViewOnce: Boolean(fileUrl) && isViewOnce
    });

    // Create message
    const message = new PrivateMessage({
      chatId,
      sender: userId,
      content: storedContent,
      encryptedContent: encryptedContent || null,
      protocolVersion,
      senderDeviceId: senderDeviceId || req.deviceId || null,
      tempId: tempId || null,
      messageType,
      fileUrl,
      replyTo: replyTo || null,
      ...privacyFields
    });

    await message.save();

    // Update chat's last message
    chat.lastMessage = message._id;
    chat.updatedAt = new Date();
    await chat.save();

    await populatePrivateMessage(message);

    const outgoingMessage = message.toObject();
    const io = req.app.get('io');
    if (io) {
      if (protocolVersion >= 2) {
        emitToDeviceRooms({
          io,
          eventName: 'private_message',
          payload: outgoingMessage,
          deviceIds: targetDeviceIds
        });
      } else {
        emitPrivateMessageEvent(req, chat, 'private_message', outgoingMessage);
      }

      enqueueBackgroundJob('push-direct-message-notifications', () => sendNotificationsToUserIds({
        io,
        userIds: chat.participants,
        excludeUserIds: [userId],
        payloadBuilder: () => buildDirectMessagePayload({
          sender: req.user,
          message: outgoingMessage
        })
      }));
    }

    res.status(201).json(serializePrivateMessageForUser(message, userId));
  } catch (error) {
    console.error('Error sending message:', error);
    if (String(error.message || '').toLowerCase().includes('plaintext content')) {
      return res.status(400).json({ message: error.message });
    }
    if (String(error.message || '').toLowerCase().includes('disappearing timer')) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: error.message || 'Failed to send message' });
  }
});

// Mark messages as read
router.patch('/chats/:chatId/messages/read', async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user._id;

    // Verify user is part of the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Mark all unread messages in this chat as read
    await PrivateMessage.updateMany(
      { 
        chatId, 
        sender: { $ne: userId },
        read: false 
      },
      { 
        read: true,
        readAt: new Date()
      }
    );

    res.json({ message: 'Messages marked as read' });
  } catch (error) {
    console.error('Error marking messages as read:', error);
    res.status(500).json({ message: 'Failed to mark messages as read' });
  }
});

router.post('/chats/:chatId/messages/:messageId/consume-view-once', async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user._id;

    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const message = await PrivateMessage.findOne({ _id: messageId, chatId });
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const consumed = markViewOnceConsumed(message, userId);
    if (consumed) {
      await message.save();
    }

    res.json({
      consumed,
      message: serializePrivateMessageForUser(message, userId)
    });
  } catch (error) {
    console.error('Error consuming view-once message:', error);
    res.status(500).json({ message: 'Failed to consume the view-once attachment' });
  }
});

router.post('/chat/messages/:messageId/reactions', async (req, res) => {
  try {
    const { messageId } = req.params;
    const emoji = typeof req.body?.emoji === 'string' ? req.body.emoji.trim() : '';
    const userId = req.user._id;

    if (!emoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await PrivateMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const chat = await Chat.findById(message.chatId);
    if (!chat || !arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const alreadyReacted = Array.isArray(message.reactions) && message.reactions.some(
      (reaction) => reaction.user.toString() === userId.toString() && reaction.emoji === emoji
    );

    if (alreadyReacted) {
      message.removeReaction(userId, emoji);
    } else {
      message.addReaction(userId, emoji);
    }

    await message.save();
    await populatePrivateMessage(message);

    const payload = {
      chatId: chat._id.toString(),
      message: message.toObject()
    };
    emitPrivateMessageEvent(req, chat, 'private_message_reaction', payload);

    res.json(payload);
  } catch (error) {
    console.error('Error updating private message reaction:', error);
    res.status(500).json({ message: 'Failed to update the reaction' });
  }
});

router.delete('/chat/messages/:messageId/reactions/:emoji', async (req, res) => {
  try {
    const { messageId, emoji } = req.params;
    const trimmedEmoji = typeof emoji === 'string' ? decodeURIComponent(emoji).trim() : '';
    const userId = req.user._id;

    if (!trimmedEmoji) {
      return res.status(400).json({ message: 'Emoji is required' });
    }

    const message = await PrivateMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const chat = await Chat.findById(message.chatId);
    if (!chat || !arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    message.removeReaction(userId, trimmedEmoji);
    await message.save();
    await populatePrivateMessage(message);

    const payload = {
      chatId: chat._id.toString(),
      message: message.toObject()
    };
    emitPrivateMessageEvent(req, chat, 'private_message_reaction', payload);

    res.json(payload);
  } catch (error) {
    console.error('Error removing private message reaction:', error);
    res.status(500).json({ message: 'Failed to remove the reaction' });
  }
});

router.put('/chat/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
    const userId = req.user._id;

    if (!content) {
      return res.status(400).json({ message: 'Message content is required' });
    }

    if (content.length > 2000) {
      return res.status(400).json({ message: 'Message must be 2000 characters or less' });
    }

    const message = await PrivateMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const chat = await Chat.findById(message.chatId);
    if (!chat || !arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!message.canEdit(userId)) {
      return res.status(400).json({ message: 'This message can no longer be edited' });
    }

    if (message.encryptedContent || Number(message.protocolVersion || 1) >= 2) {
      return res.status(400).json({ message: 'Secure messages cannot be edited in place' });
    }

    message.editContent(content);
    await message.save();
    await populatePrivateMessage(message);

    const payload = {
      chatId: chat._id.toString(),
      message: message.toObject()
    };
    emitPrivateMessageEvent(req, chat, 'private_message_edit', payload);

    res.json(payload);
  } catch (error) {
    console.error('Error editing private message:', error);
    res.status(500).json({ message: 'Failed to edit the message' });
  }
});

router.delete('/chat/messages/:messageId', async (req, res) => {
  try {
    const { messageId } = req.params;
    const userId = req.user._id;

    const message = await PrivateMessage.findById(messageId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const chat = await Chat.findById(message.chatId);
    if (!chat || !arrayIncludesId(chat.participants, userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    if (!message.canDelete(userId)) {
      return res.status(400).json({ message: 'This message can no longer be deleted' });
    }

    message.softDelete();
    await message.save();
    await populatePrivateMessage(message);

    const payload = {
      chatId: chat._id.toString(),
      message: message.toObject()
    };
    emitPrivateMessageEvent(req, chat, 'private_message_delete', payload);

    res.json(payload);
  } catch (error) {
    console.error('Error deleting private message:', error);
    res.status(500).json({ message: 'Failed to delete the message' });
  }
});

// Get all users for starting new chats
router.get('/users', async (req, res) => {
  try {
    const userId = req.user._id;
    const { search } = req.query;

    const query = { 
      _id: { $ne: userId },
      isActive: true
    };

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(query)
      .select('username email avatar status bio')
      .limit(50);

    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// Get user details
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await cacheService.memory.remember(
      `user-profile:${userId}`,
      30000,
      async () => User.findById(userId)
        .select('username email avatar status bio joinedAt lastSeen')
        .lean()
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user details:', error);
    res.status(500).json({ message: 'Failed to fetch user details' });
  }
});

module.exports = router;
