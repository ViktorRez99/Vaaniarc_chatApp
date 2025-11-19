require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoose = require('mongoose');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/auth');
const uploadRoutes = require('./routes/upload');
const chatRoutes = require('./routes/chat');
const roomRoutes = require('./routes/room');
const meetingRoutes = require('./routes/meeting');

const authenticateToken = require('./middleware/auth');
const socketAuth = require('./middleware/socketAuth');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      process.env.FRONTEND_URL || "http://localhost:5174",
      "http://localhost:5173", "http://127.0.0.1:5173", 
      "http://localhost:3000", "http://127.0.0.1:3000"
    ],
    credentials: true
  }
});

app.use(helmet({
  contentSecurityPolicy: false,
}));

const limiter = rateLimit({
  windowMs: process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000, // 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS || 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

app.use(cors({
  origin: [
    process.env.FRONTEND_URL || "http://localhost:5174",
    "http://localhost:5173", "http://127.0.0.1:5173", 
    "http://localhost:3000", "http://127.0.0.1:3000"
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/dist')));
}
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/chatapp', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Socket.IO authentication and connection handling
const User = require('./models/User');
const PrivateMessage = require('./models/PrivateMessage');
const Chat = require('./models/Chat');
const Room = require('./models/Room');
const Message = require('./models/Message');

io.use(socketAuth);

io.on('connection', (socket) => {
  console.log('User connected:', socket.user.username);
  const userId = socket.user._id;

  // Update user status to online
  User.findByIdAndUpdate(userId, { status: 'online' }).catch(console.error);

  // Broadcast user online status
  socket.broadcast.emit('user_online', {
    userId,
    username: socket.user.username,
    avatar: socket.user.avatar
  });

  // Join user's personal room
  socket.join(`user:${userId}`);

  // Handle private messages
  socket.on('private_message', async (data) => {
    try {
      const { chatId, content, messageType = 'text', fileUrl } = data;

      // Verify user is part of the chat
      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(userId)) {
        return socket.emit('error', { message: 'Invalid chat' });
      }

      // Create and save message
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

      // Populate sender info
      await message.populate('sender', 'username avatar');

      // Send to all participants
      chat.participants.forEach(participantId => {
        io.to(`user:${participantId}`).emit('private_message', message);
      });
    } catch (error) {
      console.error('Private message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle typing indicators
  socket.on('typing_start', async (data) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);
      
      if (chat && chat.participants.includes(userId)) {
        chat.participants.forEach(participantId => {
          if (participantId.toString() !== userId.toString()) {
            io.to(`user:${participantId}`).emit('user_typing', {
              chatId,
              userId,
              username: socket.user.username
            });
          }
        });
      }
    } catch (error) {
      console.error('Typing indicator error:', error);
    }
  });

  socket.on('typing_stop', async (data) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);
      
      if (chat && chat.participants.includes(userId)) {
        chat.participants.forEach(participantId => {
          if (participantId.toString() !== userId.toString()) {
            io.to(`user:${participantId}`).emit('user_stop_typing', {
              chatId,
              userId
            });
          }
        });
      }
    } catch (error) {
      console.error('Typing stop error:', error);
    }
  });

  // Handle message read status
  socket.on('mark_read', async (data) => {
    try {
      const { chatId } = data;
      const chat = await Chat.findById(chatId);
      
      if (chat && chat.participants.includes(userId)) {
        await PrivateMessage.updateMany(
          { chatId, sender: { $ne: userId }, read: false },
          { read: true, readAt: new Date() }
        );

        // Notify sender
        chat.participants.forEach(participantId => {
          if (participantId.toString() !== userId.toString()) {
            io.to(`user:${participantId}`).emit('messages_read', {
              chatId,
              readBy: userId
            });
          }
        });
      }
    } catch (error) {
      console.error('Mark read error:', error);
    }
  });

  // Room-related socket events
  socket.on('join_room', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);
      
      if (room && room.isMember(userId)) {
        socket.join(`room:${roomId}`);
        
        // Notify other members
        socket.to(`room:${roomId}`).emit('user_joined_room', {
          roomId,
          userId,
          username: socket.user.username,
          avatar: socket.user.avatar
        });
      }
    } catch (error) {
      console.error('Join room error:', error);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('leave_room', async (data) => {
    try {
      const { roomId } = data;
      socket.leave(`room:${roomId}`);
      
      // Notify other members
      socket.to(`room:${roomId}`).emit('user_left_room', {
        roomId,
        userId,
        username: socket.user.username
      });
    } catch (error) {
      console.error('Leave room error:', error);
    }
  });

  socket.on('room_message', async (data) => {
    try {
      const { roomId, content, messageType = 'text', replyTo } = data;

      // Verify user is a member of the room
      const room = await Room.findById(roomId);
      if (!room || !room.isMember(userId)) {
        return socket.emit('error', { message: 'Invalid room or access denied' });
      }

      // Create and save message
      const message = new Message({
        sender: userId,
        room: roomId,
        content: { text: content },
        messageType,
        isPrivate: false,
        replyTo: replyTo || null
      });
      
      await message.save();

      // Update room activity
      await room.updateActivity();

      // Populate sender info
      await message.populate('sender', 'username avatar');
      if (replyTo) {
        await message.populate('replyTo', 'content sender');
      }

      // Send to all room members
      io.to(`room:${roomId}`).emit('room_message', message);
    } catch (error) {
      console.error('Room message error:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Typing indicators for rooms
  socket.on('room_typing_start', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);
      
      if (room && room.isMember(userId)) {
        socket.to(`room:${roomId}`).emit('user_typing_room', {
          roomId,
          userId,
          username: socket.user.username
        });
      }
    } catch (error) {
      console.error('Room typing indicator error:', error);
    }
  });

  socket.on('room_typing_stop', async (data) => {
    try {
      const { roomId } = data;
      const room = await Room.findById(roomId);
      
      if (room && room.isMember(userId)) {
        socket.to(`room:${roomId}`).emit('user_stop_typing_room', {
          roomId,
          userId
        });
      }
    } catch (error) {
      console.error('Room typing stop error:', error);
    }
  });

  // Meeting-related socket events
  socket.on('join_meeting', (data) => {
    const { meetingId } = data;
    socket.join(`meeting:${meetingId}`);
    socket.to(`meeting:${meetingId}`).emit('user_joined_meeting', {
      userId,
      username: socket.user.username,
      avatar: socket.user.avatar
    });
  });

  socket.on('leave_meeting', (data) => {
    const { meetingId } = data;
    socket.leave(`meeting:${meetingId}`);
    socket.to(`meeting:${meetingId}`).emit('user_left_meeting', {
      userId,
      username: socket.user.username
    });
  });

  // WebRTC signaling for video calls
  socket.on('webrtc_offer', (data) => {
    const { meetingId, offer, to } = data;
    io.to(`user:${to}`).emit('webrtc_offer', {
      from: userId,
      offer,
      meetingId
    });
  });

  socket.on('webrtc_answer', (data) => {
    const { meetingId, answer, to } = data;
    io.to(`user:${to}`).emit('webrtc_answer', {
      from: userId,
      answer,
      meetingId
    });
  });

  socket.on('webrtc_ice_candidate', (data) => {
    const { meetingId, candidate, to } = data;
    io.to(`user:${to}`).emit('webrtc_ice_candidate', {
      from: userId,
      candidate,
      meetingId
    });
  });

  socket.on('toggle_audio', (data) => {
    const { meetingId, enabled } = data;
    socket.to(`meeting:${meetingId}`).emit('user_toggle_audio', {
      userId,
      enabled
    });
  });

  socket.on('toggle_video', (data) => {
    const { meetingId, enabled } = data;
    socket.to(`meeting:${meetingId}`).emit('user_toggle_video', {
      userId,
      enabled
    });
  });

  socket.on('screen_share', (data) => {
    const { meetingId, enabled } = data;
    socket.to(`meeting:${meetingId}`).emit('user_screen_share', {
      userId,
      enabled
    });
  });

  // Handle disconnection
  socket.on('disconnect', async () => {
    console.log('User disconnected:', socket.user.username);
    
    // Update user status to offline
    await User.findByIdAndUpdate(userId, {
      status: 'offline',
      lastSeen: new Date()
    }).catch(console.error);

    // Broadcast user offline status
    socket.broadcast.emit('user_offline', {
      userId,
      username: socket.user.username
    });
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/upload', authenticateToken, uploadRoutes);
app.use('/api', authenticateToken, chatRoutes);
app.use('/api', authenticateToken, roomRoutes);
app.use('/api', authenticateToken, meetingRoutes);

// 404 handler for undefined API routes
app.use('/api/*', notFoundHandler);

// Global error handler
app.use(errorHandler);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/dist/index.html'));
  });
} else {
  // In development, API documentation or redirect
  app.get('/', (req, res) => {
    res.json({
      message: 'VaaniArc API Server',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        auth: '/api/auth',
        chats: '/api/chats',
        rooms: '/api/rooms',
        upload: '/api/upload',
        meetings: '/api/meetings'
      },
      frontend: process.env.FRONTEND_URL || 'http://localhost:5174'
    });
  });
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { app, io };
