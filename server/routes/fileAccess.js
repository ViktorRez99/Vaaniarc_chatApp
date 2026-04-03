const express = require('express');
const fs = require('fs');

const User = require('../models/User');
const Message = require('../models/Message');
const PrivateMessage = require('../models/PrivateMessage');
const Room = require('../models/Room');
const Chat = require('../models/Chat');
const authenticateToken = require('../middleware/auth');
const {
  hasUserConsumedViewOnce,
  isMessageExpired
} = require('../utils/messagePrivacy');
const { arrayIncludesId } = require('../utils/idHelpers');
const {
  buildAvatarUrl,
  buildLegacyUploadUrl,
  resolveStoredFilePath,
  sanitizeStoredFilename
} = require('../utils/uploadFiles');

const router = express.Router();
const optionalAuth = authenticateToken.optionalAuth;

const sendStoredFile = (res, filename) => {
  const sanitizedFilename = sanitizeStoredFilename(filename);
  const filePath = resolveStoredFilePath(sanitizedFilename);

  if (!sanitizedFilename || !fs.existsSync(filePath)) {
    return res.status(404).json({ message: 'File not found' });
  }

  res.set({
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  });

  return res.sendFile(filePath);
};

const isPublicAvatarPath = async (filename) => {
  if (!filename) {
    return false;
  }

  const avatarPath = buildAvatarUrl(filename);
  const legacyAvatarPath = buildLegacyUploadUrl(filename);
  const user = await User.findOne({
    avatar: {
      $in: [avatarPath, legacyAvatarPath]
    }
  }).select('_id');

  return Boolean(user);
};

const denyUnavailableAttachment = (res) => res.status(410).json({
  message: 'This secure attachment is no longer available'
});

const canAccessPrivateMessageFile = async (message, userId) => {
  if (!message || !userId) {
    return false;
  }

  if (isMessageExpired(message) || hasUserConsumedViewOnce(message, userId)) {
    return 'gone';
  }

  const chat = await Chat.findById(message.chatId).select('participants');
  if (!chat) {
    return false;
  }

  return arrayIncludesId(chat.participants, userId);
};

const canAccessRoomMessageFile = async (message, userId) => {
  if (!message || !userId) {
    return false;
  }

  if (isMessageExpired(message) || hasUserConsumedViewOnce(message, userId)) {
    return 'gone';
  }

  const room = await Room.findById(message.room).select('members.user isActive');
  if (!room || !room.isActive) {
    return false;
  }

  return room.isMember(userId);
};

const serveUploadByFilename = async (req, res) => {
  const filename = sanitizeStoredFilename(req.params.filename);

  if (!filename) {
    return res.status(404).json({ message: 'File not found' });
  }

  if (await isPublicAvatarPath(filename)) {
    return sendStoredFile(res, filename);
  }

  if (!req.user) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const [privateMessage, roomMessage] = await Promise.all([
    PrivateMessage.findOne({
      'fileMetadata.filename': filename,
      isDeleted: false
    }).select('chatId sender fileMetadata filename fileUrl expiresAt isViewOnce viewedBy'),
    Message.findOne({
      'content.file.filename': filename,
      isDeleted: false
    }).select('room sender content.file expiresAt isViewOnce viewedBy')
  ]);

  const privateAccess = await canAccessPrivateMessageFile(privateMessage, req.user._id);
  if (privateAccess === 'gone') {
    return denyUnavailableAttachment(res);
  }

  if (privateAccess) {
    return sendStoredFile(res, filename);
  }

  const roomAccess = await canAccessRoomMessageFile(roomMessage, req.user._id);
  if (roomAccess === 'gone') {
    return denyUnavailableAttachment(res);
  }

  if (roomAccess) {
    return sendStoredFile(res, filename);
  }

  return res.status(403).json({ message: 'Access denied' });
};

router.get('/api/upload/avatars/:filename', async (req, res) => {
  if (!await isPublicAvatarPath(req.params.filename)) {
    return res.status(404).json({ message: 'Avatar not found' });
  }

  return sendStoredFile(res, req.params.filename);
});

router.get('/api/upload/files/:filename', optionalAuth, serveUploadByFilename);
router.get('/uploads/:filename', optionalAuth, serveUploadByFilename);

module.exports = router;
