const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Message = require('../models/Message');
const Room = require('../models/Room');
const Chat = require('../models/Chat');
const PrivateMessage = require('../models/PrivateMessage');
const { getFileCategory, formatFileSize, canPreview } = require('../utils/fileHelpers');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = process.env.ALLOWED_FILE_TYPES ? 
    process.env.ALLOWED_FILE_TYPES.split(',') : 
    ['image/jpeg', 'image/png', 'image/gif', 'text/plain', 'application/pdf'];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760, // 10MB default
    files: 1
  }
});

// Upload file and send as message to room (group chat)
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    const { roomId, messageType = 'file' } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!roomId) {
      return res.status(400).json({ message: 'Room ID is required' });
    }

    // Verify user is a member of the room
    const room = await Room.findById(roomId);
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }
    if (!room.isMember(req.user._id)) {
      return res.status(403).json({ 
        message: 'Access denied. Not a member of this room.' 
      });
    }
    if (!room.settings.allowFileSharing) {
      return res.status(403).json({ 
        message: 'File sharing is disabled in this room' 
      });
    }

    // Create file URL
    const fileUrl = `/uploads/${req.file.filename}`;

    // Determine message type based on file type
    const category = getFileCategory(req.file.mimetype);
    let actualMessageType = messageType;
    if (category === 'image') {
      actualMessageType = 'image';
    } else if (category === 'video') {
      actualMessageType = 'video';
    } else if (category === 'audio') {
      actualMessageType = 'audio';
    } else {
      actualMessageType = 'file';
    }

    // Create message with file content
    const message = new Message({
      sender: req.user._id,
      room: roomId,
      content: {
        file: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: fileUrl,
          category: category,
          canPreview: canPreview(req.file.mimetype)
        }
      },
      messageType: actualMessageType,
      isPrivate: false
    });

    await message.save();
    await message.populate('sender', 'username avatar');

    // Update room activity
    await room.updateActivity();

    res.status(201).json({
      message: 'File uploaded and message sent successfully',
      data: message,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        formattedSize: formatFileSize(req.file.size),
        url: fileUrl,
        category: category,
        canPreview: canPreview(req.file.mimetype)
      }
    });
  } catch (error) {
    console.error('File upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'File too large. Maximum size is 10MB.' 
      });
    }
    
    if (error.message.includes('File type')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error uploading file' });
  }
});

// Upload file and send as message to private chat
router.post('/chat-file', upload.single('file'), async (req, res) => {
  try {
    const { chatId, messageType = 'file' } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    if (!chatId) {
      return res.status(400).json({ message: 'Chat ID is required' });
    }

    // Verify user is part of the chat
    const chat = await Chat.findById(chatId);
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    if (!chat.participants.includes(req.user._id)) {
      return res.status(403).json({ 
        message: 'Access denied. Not a participant in this chat.' 
      });
    }

    // Create file URL
    const fileUrl = `/uploads/${req.file.filename}`;

    // Determine message type based on file type
    const category = getFileCategory(req.file.mimetype);
    let actualMessageType = messageType;
    if (category === 'image') {
      actualMessageType = 'image';
    } else if (category === 'video') {
      actualMessageType = 'video';
    } else if (category === 'audio') {
      actualMessageType = 'audio';
    } else {
      actualMessageType = 'file';
    }

    // Create private message with file
    const message = new PrivateMessage({
      chatId: chatId,
      sender: req.user._id,
      content: req.file.originalname,
      messageType: actualMessageType,
      fileUrl: fileUrl,
      fileMetadata: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: category,
        canPreview: canPreview(req.file.mimetype)
      }
    });

    await message.save();
    await message.populate('sender', 'username avatar');

    // Update chat's last message
    chat.lastMessage = message._id;
    chat.updatedAt = new Date();
    await chat.save();

    res.status(201).json({
      message: 'File uploaded and message sent successfully',
      data: message,
      file: {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        formattedSize: formatFileSize(req.file.size),
        url: fileUrl,
        category: category,
        canPreview: canPreview(req.file.mimetype)
      }
    });
  } catch (error) {
    console.error('Chat file upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'File too large. Maximum size is 10MB.' 
      });
    }
    
    if (error.message.includes('File type')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: 'Server error uploading file' });
  }
});

// Upload avatar
router.post('/avatar', upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No avatar file uploaded' });
    }

    // Only allow image files for avatars
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ 
        message: 'Avatar must be an image file' 
      });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    // Update user avatar
    const User = require('../models/User');
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.avatar = avatarUrl;
    await user.save();

    res.json({
      message: 'Avatar uploaded successfully',
      avatar: avatarUrl
    });
  } catch (error) {
    console.error('Avatar upload error:', error);
    
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'Avatar file too large. Maximum size is 10MB.' 
      });
    }
    
    res.status(500).json({ message: 'Server error uploading avatar' });
  }
});

// Get file info
router.get('/file/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Find message with this file
    const message = await Message.findOne({
      'content.file.filename': filename,
      isDeleted: false
    }).populate('sender', 'username');

    if (!message) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user has access to this file
    let hasAccess = false;

    if (message.isPrivate) {
      // Private message - check if user is sender or recipient
      hasAccess = message.sender._id.toString() === req.user._id.toString() ||
                  (message.recipient && message.recipient.toString() === req.user._id.toString());
    } else if (message.room) {
      // Room message - check if user is member of the room
      const room = await Room.findById(message.room);
      hasAccess = room && room.isMember(req.user._id);
    }

    if (!hasAccess) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json({
      file: message.content.file,
      sender: message.sender.username,
      uploadedAt: message.createdAt
    });
  } catch (error) {
    console.error('Get file info error:', error);
    res.status(500).json({ message: 'Server error getting file info' });
  }
});

// Delete file
router.delete('/file/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    
    // Find message with this file
    const message = await Message.findOne({
      'content.file.filename': filename,
      isDeleted: false
    });

    if (!message) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user can delete this file (only sender can delete)
    if (message.sender.toString() !== req.user._id.toString()) {
      return res.status(403).json({ 
        message: 'Access denied. Only the sender can delete this file.' 
      });
    }

    // Soft delete the message (which contains the file)
    message.softDelete();
    await message.save();

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    console.error('Delete file error:', error);
    res.status(500).json({ message: 'Server error deleting file' });
  }
});

// Error handling middleware specific to upload routes
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        message: 'File too large. Maximum size is 10MB.' 
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        message: 'Too many files. Only one file allowed per upload.' 
      });
    }
    if (error.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({ 
        message: 'Unexpected field name for file upload.' 
      });
    }
  }
  
  if (error.message.includes('File type')) {
    return res.status(400).json({ message: error.message });
  }
  
  res.status(500).json({ message: 'File upload error' });
});

module.exports = router;
