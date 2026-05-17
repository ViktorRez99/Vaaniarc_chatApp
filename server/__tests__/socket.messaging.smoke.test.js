const fs = require('fs/promises');
const path = require('path');
const request = require('supertest');
const { encode, decode } = require('@msgpack/msgpack');
const { io: createSocketClient } = require('../../client/node_modules/socket.io-client');

const mockUserA = '507f1f77bcf86cd799439011';
const mockDeviceA = 'device-a';

const userA = mockUserA;
const userB = '507f1f77bcf86cd799439012';
const chatId = '507f1f77bcf86cd799439101';
const roomId = '507f1f77bcf86cd799439201';
const deviceA = mockDeviceA;
const deviceB = 'device-b';

const mockSocketUser = {
  _id: mockUserA,
  username: 'alice',
  avatar: null
};
const socketUser = mockSocketUser;

const savedPrivateMessages = [];
const savedRoomMessages = [];
const uploadedFiles = [];

const decodeSocketPayload = (payload) => {
  if (!payload) {
    return payload;
  }

  if (payload instanceof ArrayBuffer) {
    return decode(new Uint8Array(payload));
  }

  if (ArrayBuffer.isView(payload)) {
    return decode(new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength));
  }

  return payload;
};

const waitForDecodedEvent = (socket, eventName, timeoutMs = 2000) => new Promise((resolve, reject) => {
  let timeoutId = null;

  const cleanup = () => {
    clearTimeout(timeoutId);
    socket.off(eventName, handleEvent);
    socket.off('error', handleError);
    socket.off('connect_error', handleError);
  };

  const handleEvent = (payload) => {
    cleanup();
    resolve(decodeSocketPayload(payload));
  };

  const handleError = (error) => {
    cleanup();
    reject(error instanceof Error ? error : new Error(error?.message || 'Socket smoke test failed'));
  };

  timeoutId = setTimeout(() => {
    cleanup();
    reject(new Error(`Timed out waiting for ${eventName}`));
  }, timeoutMs);

  socket.once(eventName, handleEvent);
  socket.once('error', handleError);
  socket.once('connect_error', handleError);
});

const connectSocket = (port) => new Promise((resolve, reject) => {
  const socket = createSocketClient(`http://127.0.0.1:${port}`, {
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
    timeout: 2000
  });

  const cleanup = () => {
    socket.off('connect', handleConnect);
    socket.off('connect_error', handleError);
  };

  const handleConnect = () => {
    cleanup();
    resolve(socket);
  };

  const handleError = (error) => {
    cleanup();
    socket.close();
    reject(error);
  };

  socket.once('connect', handleConnect);
  socket.once('connect_error', handleError);
});

const buildEncryptedPayload = (type = 'text') => JSON.stringify({
  version: 2,
  protocolVersion: 2,
  type,
  algorithm: 'X25519-sealedbox+XSalsa20-Poly1305',
  senderUserId: userA,
  senderDeviceId: deviceA,
  senderFingerprint: 'fingerprint-a',
  nonce: type === 'text' ? 'text-nonce' : undefined,
  ciphertext: type === 'text' ? 'text-ciphertext' : undefined,
  dataNonce: type === 'file' ? 'file-nonce' : undefined,
  metadataNonce: type === 'file' ? 'metadata-nonce' : undefined,
  metadataCiphertext: type === 'file' ? 'metadata-ciphertext' : undefined,
  envelopes: [
    { deviceId: deviceA, wrappedKey: 'self-key' },
    { deviceId: deviceB, wrappedKey: 'peer-key' }
  ]
});

jest.mock('../middleware/auth', () => {
  const authenticateToken = jest.fn((req, res, next) => {
    req.user = mockSocketUser;
    req.deviceId = mockDeviceA;
    req.session = { deviceId: mockDeviceA };
    next();
  });

  authenticateToken.requireCsrf = jest.fn((req, res, next) => next());
  authenticateToken.optionalAuth = jest.fn((req, res, next) => {
    req.user = mockSocketUser;
    req.deviceId = mockDeviceA;
    next();
  });
  authenticateToken.resolveAuthentication = jest.fn(async () => ({
    authStrategy: 'session',
    user: mockSocketUser,
    session: { deviceId: mockDeviceA }
  }));

  return authenticateToken;
});

jest.mock('../middleware/socketAuth', () => async (socket, next) => {
  socket.userId = mockUserA;
  socket.username = mockSocketUser.username;
  socket.user = mockSocketUser;
  socket.session = { deviceId: mockDeviceA };
  socket.deviceId = mockDeviceA;
  socket.device = {
    save: jest.fn().mockResolvedValue(null)
  };
  next();
});

jest.mock('../utils/passkeyEnrollment', () => ({
  getPasskeyEnrollmentStatus: jest.fn(async () => ({
    hasPasskey: true,
    passkeyRequired: false
  })),
  requirePasskeyEnrollment: jest.fn((req, res, next) => next())
}));

jest.mock('../utils/deviceDelivery', () => {
  const actual = jest.requireActual('../utils/deviceDelivery');
  return {
    ...actual,
    resolveAuthorizedDeviceIds: jest.fn(async ({ deviceIds = [] }) => deviceIds)
  };
});

jest.mock('../utils/messageIdempotency', () => ({
  findExistingPrivateMessage: jest.fn(async () => null),
  findExistingRoomMessage: jest.fn(async () => null)
}));

jest.mock('../utils/privateMessageFormatting', () => ({
  populatePrivateMessage: jest.fn(async () => null),
  serializePrivateMessageForUser: jest.fn((message) => (
    typeof message?.toObject === 'function' ? message.toObject() : message
  ))
}));

jest.mock('../utils/userBlocks', () => ({
  isBlockedBetween: jest.fn(async () => false)
}));

jest.mock('../services/backgroundJobs', () => ({
  enqueueBackgroundJob: jest.fn()
}));

jest.mock('../services/pushService', () => ({
  buildDirectMessagePayload: jest.fn(() => ({})),
  buildRoomMessagePayload: jest.fn(() => ({})),
  sendNotificationsToUserIds: jest.fn(async () => null)
}));

const { app, server, io } = require('../server');
const User = require('../models/User');
const Chat = require('../models/Chat');
const Room = require('../models/Room');
const PrivateMessage = require('../models/PrivateMessage');
const Message = require('../models/Message');
const { UPLOADS_DIR } = require('../utils/uploadFiles');

let port;

beforeAll(async () => {
  jest.spyOn(User, 'findByIdAndUpdate').mockResolvedValue(null);

  const chat = new Chat({
    _id: chatId,
    participants: [userA, userB],
    type: 'private'
  });
  chat.save = jest.fn(async () => chat);
  jest.spyOn(Chat, 'findById').mockResolvedValue(chat);

  const room = new Room({
    _id: roomId,
    name: 'Smoke Room',
    creator: userA,
    members: [{ user: userA }, { user: userB }],
    settings: { allowFileSharing: true }
  });
  room.isMember = jest.fn((userId) => String(userId) === userA);
  room.updateActivity = jest.fn(async () => room);
  jest.spyOn(Room, 'findById').mockResolvedValue(room);

  jest.spyOn(PrivateMessage, 'findOne').mockResolvedValue(null);
  jest.spyOn(PrivateMessage.prototype, 'save').mockImplementation(async function savePrivateMessage() {
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    savedPrivateMessages.push(this);
    return this;
  });
  jest.spyOn(PrivateMessage.prototype, 'populate').mockImplementation(async function populatePrivateMessage() {
    return this;
  });

  jest.spyOn(Message, 'findOne').mockResolvedValue(null);
  jest.spyOn(Message.prototype, 'save').mockImplementation(async function saveRoomMessage() {
    this.createdAt = this.createdAt || new Date();
    this.updatedAt = this.updatedAt || new Date();
    savedRoomMessages.push(this);
    return this;
  });
  jest.spyOn(Message.prototype, 'populate').mockImplementation(async function populateRoomMessage() {
    return this;
  });

  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

afterEach(() => {
  savedPrivateMessages.length = 0;
  savedRoomMessages.length = 0;
});

afterAll(async () => {
  await Promise.all(uploadedFiles.map((filename) => (
    fs.unlink(path.join(UPLOADS_DIR, filename)).catch(() => null)
  )));

  io.close();

  if (server.listening) {
    await new Promise((resolve) => server.close(resolve));
  }

  jest.restoreAllMocks();
});

describe('socket messaging smoke checks', () => {
  test('accepts an encrypted direct socket message and emits a message_sent ack', async () => {
    const socket = await connectSocket(port);
    const tempId = 'smoke-direct-message';
    const encryptedContent = buildEncryptedPayload('text');

    try {
      const ackPromise = waitForDecodedEvent(socket, 'message_sent');
      socket.emit('private_message', encode({
        chatId,
        content: '[Encrypted message]',
        encryptedContent,
        messageType: 'text',
        tempId
      }));

      const ack = await ackPromise;

      expect(ack.tempId).toBe(tempId);
      expect(savedPrivateMessages).toHaveLength(1);
      expect(savedPrivateMessages[0].content).toBe('[Encrypted message]');
      expect(savedPrivateMessages[0].encryptedContent).toBe(encryptedContent);
      expect(savedPrivateMessages[0].protocolVersion).toBe(2);
      expect(savedPrivateMessages[0].senderDeviceId).toBe(deviceA);
    } finally {
      socket.close();
    }
  });

  test('accepts an encrypted room socket message and emits the room message payload', async () => {
    const socket = await connectSocket(port);
    const tempId = 'smoke-room-message';
    const encryptedContent = buildEncryptedPayload('text');

    try {
      const messagePromise = waitForDecodedEvent(socket, 'room_message');
      socket.emit('room_message', encode({
        roomId,
        content: '[Encrypted message]',
        encryptedContent,
        messageType: 'text',
        tempId
      }));

      const message = await messagePromise;

      expect(message.tempId).toBe(tempId);
      expect(savedRoomMessages).toHaveLength(1);
      expect(savedRoomMessages[0].content.text).toBe('[Encrypted message]');
      expect(savedRoomMessages[0].encryptedContent).toBe(encryptedContent);
      expect(savedRoomMessages[0].protocolVersion).toBe(2);
      expect(savedRoomMessages[0].senderDeviceId).toBe(deviceA);
    } finally {
      socket.close();
    }
  });
});

describe('encrypted file sending smoke checks', () => {
  test('stores encrypted direct chat attachments with their encryption payload', async () => {
    const encryptedFilePayload = buildEncryptedPayload('file');

    const response = await request(app)
      .post('/api/upload/chat-file')
      .field('chatId', chatId)
      .field('tempId', 'smoke-direct-file')
      .field('encryptedFilePayload', encryptedFilePayload)
      .attach('file', Buffer.from([1, 2, 3, 4]), {
        filename: 'cipher.bin',
        contentType: 'application/octet-stream'
      });

    expect(response.status).toBe(201);
    expect(response.body.file).toMatchObject({
      originalName: 'Encrypted attachment',
      category: 'encrypted',
      canPreview: false
    });
    expect(savedPrivateMessages).toHaveLength(1);
    expect(savedPrivateMessages[0].content).toBe('[Encrypted attachment]');
    expect(savedPrivateMessages[0].fileMetadata.encryptionPayload).toBe(encryptedFilePayload);
    expect(savedPrivateMessages[0].senderDeviceId).toBe(deviceA);

    if (response.body.file?.filename) {
      uploadedFiles.push(response.body.file.filename);
    }
  });

  test('stores encrypted room attachments with their encryption payload', async () => {
    const encryptedFilePayload = buildEncryptedPayload('file');

    const response = await request(app)
      .post('/api/upload/file')
      .field('roomId', roomId)
      .field('tempId', 'smoke-room-file')
      .field('encryptedFilePayload', encryptedFilePayload)
      .attach('file', Buffer.from([5, 6, 7, 8]), {
        filename: 'cipher.bin',
        contentType: 'application/octet-stream'
      });

    expect(response.status).toBe(201);
    expect(response.body.file).toMatchObject({
      originalName: 'Encrypted attachment',
      category: 'encrypted',
      canPreview: false
    });
    expect(savedRoomMessages).toHaveLength(1);
    expect(savedRoomMessages[0].content.file.encryptionPayload).toBe(encryptedFilePayload);
    expect(savedRoomMessages[0].senderDeviceId).toBe(deviceA);

    if (response.body.file?.filename) {
      uploadedFiles.push(response.body.file.filename);
    }
  });
});
