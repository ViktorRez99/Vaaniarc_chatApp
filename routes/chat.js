const express = require('express');
const router = express.Router();
const Chat = require('../models/Chat');
const PrivateMessage = require('../models/PrivateMessage');
const User = require('../models/User');

// Get all chats for the authenticated user
router.get('/chats', async (req, res) => {
  try {
    const userId = req.user._id;
    
    const chats = await Chat.find({ participants: userId })
      .populate('participants', 'username avatar status')
      .populate({
        path: 'lastMessage',
        select: 'content messageType createdAt sender read'
      })
      .sort({ updatedAt: -1 });
    
    res.json(chats);
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
        select: 'content messageType createdAt sender read'
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
          select: 'content messageType createdAt sender read'
        });
    }

    res.json(chat);
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

    if (!chat.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build query
    const query = { chatId };
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await PrivateMessage.find(query)
      .populate('sender', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

// Send a message in a chat
router.post('/chats/:chatId/messages', async (req, res) => {
  try {
    const { chatId } = req.params;
    const { content, messageType = 'text', fileUrl } = req.body;
    const userId = req.user._id;

    // Verify user is part of the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    if (!chat.participants.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Create message
    const message = new PrivateMessage({
      chatId,
      sender: userId,
      content,
      messageType,
      fileUrl
    });

    await message.save();

    // Update chat's last message
    chat.lastMessage = message._id;
    chat.updatedAt = new Date();
    await chat.save();

    // Populate sender information
    await message.populate('sender', 'username avatar');

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ message: 'Failed to send message' });
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

    if (!chat.participants.includes(userId)) {
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

    const user = await User.findById(userId)
      .select('username email avatar status bio joinedAt lastSeen');

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
