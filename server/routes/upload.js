const express = require('express');
const fs = require('fs/promises');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const Message = require('../models/Message');
const Room = require('../models/Room');
const Chat = require('../models/Chat');
const PrivateMessage = require('../models/PrivateMessage');
const { getFileCategory, formatFileSize, canPreview } = require('../utils/fileHelpers');
const { arrayIncludesId } = require('../utils/idHelpers');
const { validateDeviceBoundPayload } = require('../utils/e2eePayloads');
const { emitToDeviceRooms, resolveAuthorizedDeviceIds } = require('../utils/deviceDelivery');
const { findExistingPrivateMessage, findExistingRoomMessage } = require('../utils/messageIdempotency');
const {
  buildDirectMessagePayload,
  buildRoomMessagePayload,
  sendNotificationsToUserIds
} = require('../services/pushService');
const { enqueueBackgroundJob } = require('../services/backgroundJobs');
const { emitSocketEvent } = require('../utils/socketPayloads');
const {
  populatePrivateMessage,
  serializePrivateMessageForUser
} = require('../utils/privateMessageFormatting');
const { buildPrivacyFields } = require('../utils/messagePrivacy');
const {
  buildAttachmentUrl,
  buildAvatarUrl,
  ensureUploadsDirectory
} = require('../utils/uploadFiles');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, ensureUploadsDirectory());
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  if (req.body?.encryptedFilePayload && file.mimetype === 'application/octet-stream') {
    cb(null, true);
    return;
  }

  const allowedTypes = process.env.ALLOWED_FILE_TYPES ? 
    process.env.ALLOWED_FILE_TYPES.split(',') : 
    ['image/jpeg', 'image/png', 'image/gif', 'text/plain', 'application/pdf', 'application/octet-stream'];
  
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

const cleanupUploadedFile = async (filePath) => {
  if (!filePath) {
    return;
  }

  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Failed to remove duplicate upload:', error);
    }
  }
};

// Upload file and send as message to room (group chat)
router.post('/file', upload.single('file'), async (req, res) => {
  try {
    const { roomId, messageType = 'file', encryptedFilePayload, tempId, expiresInSeconds, isViewOnce } = req.body;

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
    const fileUrl = buildAttachmentUrl(req.file.filename);
    const isEncryptedAttachment = Boolean(encryptedFilePayload);
    const payloadValidation = validateDeviceBoundPayload({
      encryptionPayload: encryptedFilePayload,
      authenticatedDeviceId: req.deviceId || null,
      requireSelfEnvelope: true
    });
    const { protocolVersion, senderDeviceId, targetDeviceIds } = payloadValidation;

    if (!payloadValidation.isValid) {
      return res.status(400).json({ message: payloadValidation.error });
    }

    let authorizedTargetDeviceIds = [];
    if (protocolVersion >= 2) {
      authorizedTargetDeviceIds = await resolveAuthorizedDeviceIds({
        userIds: room.members.map((member) => member.user),
        deviceIds: targetDeviceIds
      });

      if (authorizedTargetDeviceIds.length !== targetDeviceIds.length) {
        return res.status(400).json({ message: 'The encrypted attachment targets unauthorized devices.' });
      }
    }

    const existingMessage = await findExistingRoomMessage({
      roomId,
      senderId: req.user._id,
      tempId
    });
    if (existingMessage) {
      await cleanupUploadedFile(req.file.path);
      await existingMessage.populate('sender', 'username avatar');
      if (existingMessage.replyTo) {
        await existingMessage.populate('replyTo', 'content sender');
      }
      return res.status(200).json({
        message: 'Duplicate upload ignored',
        data: existingMessage
      });
    }

    // Determine message type based on file type
    const category = isEncryptedAttachment ? 'encrypted' : getFileCategory(req.file.mimetype);
    let actualMessageType = messageType;
    if (isEncryptedAttachment) {
      actualMessageType = 'file';
    } else if (category === 'image') {
      actualMessageType = 'image';
    } else if (category === 'video') {
      actualMessageType = 'video';
    } else if (category === 'audio') {
      actualMessageType = 'audio';
    } else {
      actualMessageType = 'file';
    }

    const privacyFields = buildPrivacyFields({
      expiresInSeconds,
      isViewOnce
    });

    // Create message with file content
    const message = new Message({
      sender: req.user._id,
      room: roomId,
      protocolVersion,
      senderDeviceId: senderDeviceId || req.deviceId || null,
      content: {
        file: {
          filename: req.file.filename,
          originalName: isEncryptedAttachment ? 'Encrypted attachment' : req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: fileUrl,
          category: category,
          canPreview: (isEncryptedAttachment || privacyFields.isViewOnce) ? false : canPreview(req.file.mimetype),
          encryptionPayload: encryptedFilePayload || null
        }
      },
      messageType: actualMessageType,
      isPrivate: false,
      tempId: tempId || null,
      ...privacyFields
    });

    await message.save();
    await message.populate('sender', 'username avatar');

    // Update room activity
    await room.updateActivity();

    const io = req.app.get('io');
    if (io) {
      const deliveryPayload = {
        ...message.toObject(),
        tempId: tempId || null
      };

      if (protocolVersion >= 2 && authorizedTargetDeviceIds.length) {
        emitToDeviceRooms({
          io,
          eventName: 'room_message',
          payload: deliveryPayload,
          deviceIds: authorizedTargetDeviceIds
        });
      } else {
        emitSocketEvent(io.to(`room:${roomId}`), 'room_message', deliveryPayload);
      }

      enqueueBackgroundJob('push-room-file-notifications', () => sendNotificationsToUserIds({
        io,
        userIds: room.members.map((member) => member.user),
        excludeUserIds: [req.user._id],
        payloadBuilder: () => buildRoomMessagePayload({
          sender: req.user,
          room,
          message: deliveryPayload
        })
      }));
    }

    res.status(201).json({
      message: 'File uploaded and message sent successfully',
      data: message,
      file: {
        filename: req.file.filename,
        originalName: isEncryptedAttachment ? 'Encrypted attachment' : req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        formattedSize: formatFileSize(req.file.size),
        url: fileUrl,
        category: category,
        canPreview: (isEncryptedAttachment || privacyFields.isViewOnce) ? false : canPreview(req.file.mimetype)
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

    if (String(error.message || '').toLowerCase().includes('disappearing timer')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: error.message || 'Server error uploading file' });
  }
});

// Upload file and send as message to private chat
router.post('/chat-file', upload.single('file'), async (req, res) => {
  try {
    const {
      chatId,
      messageType = 'file',
      encryptedFilePayload,
      expiresInSeconds,
      isViewOnce,
      tempId
    } = req.body;

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
    if (!arrayIncludesId(chat.participants, req.user._id)) {
      return res.status(403).json({ 
        message: 'Access denied. Not a participant in this chat.' 
      });
    }

    // Create file URL
    const fileUrl = buildAttachmentUrl(req.file.filename);

    const isEncryptedAttachment = Boolean(encryptedFilePayload);
    const payloadValidation = validateDeviceBoundPayload({
      encryptionPayload: encryptedFilePayload,
      authenticatedDeviceId: req.deviceId || null,
      requireSelfEnvelope: true
    });
    const { protocolVersion, senderDeviceId, targetDeviceIds } = payloadValidation;

    if (!payloadValidation.isValid) {
      return res.status(400).json({ message: payloadValidation.error });
    }

    let authorizedTargetDeviceIds = [];
    if (protocolVersion >= 2) {
      authorizedTargetDeviceIds = await resolveAuthorizedDeviceIds({
        userIds: chat.participants,
        deviceIds: targetDeviceIds
      });

      if (authorizedTargetDeviceIds.length !== targetDeviceIds.length) {
        return res.status(400).json({ message: 'The encrypted attachment targets unauthorized devices.' });
      }
    }

    const existingMessage = await findExistingPrivateMessage({
      chatId,
      senderId: req.user._id,
      tempId
    });
    if (existingMessage) {
      await cleanupUploadedFile(req.file.path);
      await populatePrivateMessage(existingMessage);
      return res.status(200).json({
        message: 'Duplicate upload ignored',
        data: serializePrivateMessageForUser(existingMessage, req.user._id)
      });
    }

    // Determine message type based on file type
    const category = isEncryptedAttachment ? 'encrypted' : getFileCategory(req.file.mimetype);
    let actualMessageType = messageType;
    if (isEncryptedAttachment) {
      actualMessageType = 'file';
    } else if (category === 'image') {
      actualMessageType = 'image';
    } else if (category === 'video') {
      actualMessageType = 'video';
    } else if (category === 'audio') {
      actualMessageType = 'audio';
    } else {
      actualMessageType = 'file';
    }

    const privacyFields = buildPrivacyFields({
      expiresInSeconds,
      isViewOnce
    });

    // Create private message with file
    const message = new PrivateMessage({
      chatId: chatId,
      sender: req.user._id,
      protocolVersion,
      senderDeviceId: senderDeviceId || req.deviceId || null,
      tempId: tempId || null,
      content: isEncryptedAttachment ? '[Encrypted attachment]' : req.file.originalname,
      messageType: actualMessageType,
      fileUrl: fileUrl,
      fileMetadata: {
        filename: req.file.filename,
        originalName: isEncryptedAttachment ? 'Encrypted attachment' : req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        category: category,
        canPreview: (isEncryptedAttachment || privacyFields.isViewOnce) ? false : canPreview(req.file.mimetype),
        encryptionPayload: encryptedFilePayload || null
      },
      ...privacyFields
    });

    await message.save();
    await populatePrivateMessage(message);

    // Update chat's last message
    chat.lastMessage = message._id;
    chat.updatedAt = new Date();
    await chat.save();

    // Broadcast to chat participants (real-time delivery)
    const io = req.app.get('io');
    if (io && chat.participants) {
      const deliveryPayload = {
        ...message.toObject(),
        tempId: tempId || null
      };

      if (protocolVersion >= 2 && authorizedTargetDeviceIds.length) {
        emitToDeviceRooms({
          io,
          eventName: 'private_message',
          payload: deliveryPayload,
          deviceIds: authorizedTargetDeviceIds
        });
      } else {
        chat.participants.forEach(participantId => {
          const pid = participantId.toString();
          const uid = req.user._id.toString();
          if (pid !== uid) {
            emitSocketEvent(io.to(`user:${pid}`), 'private_message', deliveryPayload);
          }
        });

        emitSocketEvent(io.to(`user:${req.user._id}`), 'private_message', deliveryPayload);
      }

      enqueueBackgroundJob('push-direct-file-notifications', () => sendNotificationsToUserIds({
        io,
        userIds: chat.participants,
        excludeUserIds: [req.user._id],
        payloadBuilder: () => buildDirectMessagePayload({
          sender: req.user,
          message: deliveryPayload
        })
      }));
    }

    res.status(201).json({
      message: 'File uploaded and message sent successfully',
      data: serializePrivateMessageForUser(message, req.user._id),
      file: {
        filename: req.file.filename,
        originalName: isEncryptedAttachment ? 'Encrypted attachment' : req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        formattedSize: formatFileSize(req.file.size),
        url: fileUrl,
        category: category,
        canPreview: (isEncryptedAttachment || privacyFields.isViewOnce) ? false : canPreview(req.file.mimetype)
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

    if (String(error.message || '').toLowerCase().includes('disappearing timer')) {
      return res.status(400).json({ message: error.message });
    }
    
    res.status(500).json({ message: error.message || 'Server error uploading file' });
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

    const avatarUrl = buildAvatarUrl(req.file.filename);

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
