# VaaniArc - Real-Time Chat Application

A modern, feature-rich real-time chat application built with React, Node.js, Express, Socket.IO, and MongoDB. VaaniArc provides a seamless communication experience with support for public rooms, private messaging, video meetings, and more.

## 🚀 Features

### Authentication & User Management
- **Multi-step Registration**: Two-step signup process with personal details and profile customization
- **Avatar System**: Choose from pre-generated avatars or upload custom profile pictures
- **Image Cropping**: WhatsApp/Telegram-style image cropping with zoom controls (1:1 aspect ratio)
- **JWT Authentication**: Secure token-based authentication
- **Password Strength Indicator**: Real-time password strength visualization
- **User Profiles**: Customizable profiles with bio, phone, location, and more

### Messaging Features
- **Real-Time Chat**: Instant messaging powered by Socket.IO
- **Public Rooms**: Create and join public chat rooms
- **Private Messages**: One-on-one private conversations
- **Message Persistence**: All messages stored in MongoDB
- **Typing Indicators**: See when other users are typing
- **Online Status**: Real-time user presence tracking
- **Message History**: Full chat history with timestamps

### Video Meetings
- **Integrated Video Calls**: Built-in video meeting functionality
- **Meeting Scheduling**: Schedule and manage video meetings
- **Room Management**: Create and control meeting rooms

### User Interface
- **Modern Design**: Clean, intuitive interface with glassmorphism effects
- **Responsive Layout**: Works seamlessly on desktop and mobile devices
- **Dark Theme**: Eye-friendly dark mode throughout the application
- **Smooth Animations**: Polished animations and transitions
- **Real-time Notifications**: Toast notifications for important events
- **Settings Panel**: Comprehensive user settings management

## 🛠️ Tech Stack

### Frontend
- **React 18.3**: Modern React with hooks and functional components
- **Vite**: Lightning-fast build tool and dev server
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Accessible component primitives
- **Socket.IO Client**: Real-time bidirectional communication
- **React Easy Crop**: Advanced image cropping functionality
- **Lucide React**: Beautiful icon library

### Backend
- **Node.js**: JavaScript runtime
- **Express.js**: Web application framework
- **MongoDB**: NoSQL database with Mongoose ODM
- **Socket.IO**: Real-time engine
- **JWT**: JSON Web Token authentication
- **Bcrypt**: Password hashing
- **Multer**: File upload handling
- **Express Rate Limit**: API rate limiting
- **Helmet**: Security headers

## 📦 Installation

### Prerequisites
- Node.js >= 18.0.0
- MongoDB database (local or cloud)
- npm >= 8.0.0

### Setup Instructions

1. **Clone the repository**
   ```bash
   git clone https://github.com/ViktorRez99/Vaaniarc_chatApp.git
   cd Vaaniarc_chatApp
   ```

2. **Install dependencies**
   ```bash
   npm run setup
   ```
   This will install both server and client dependencies.

3. **Environment Configuration**
   
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # MongoDB
   MONGODB_URI=your_mongodb_connection_string

   # JWT Configuration
   JWT_SECRET=your_super_secret_jwt_key
   JWT_EXPIRES_IN=7d

   # CORS
   CLIENT_URL=http://localhost:5173

   # File Upload
   MAX_FILE_SIZE=5242880
   ```

4. **Start Development Servers**
   
   Run both frontend and backend concurrently:
   ```bash
   npm run dev:full
   ```

   Or run them separately:
   ```bash
   # Terminal 1 - Backend
   npm run dev

   # Terminal 2 - Frontend
   npm run client
   ```

5. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend: http://localhost:5000

## 📁 Project Structure

```
vaaniArc/
├── client/                 # React frontend
│   ├── public/            # Static assets
│   ├── src/
│   │   ├── components/    # React components
│   │   │   ├── Auth.jsx           # Authentication UI
│   │   │   ├── ChatHub.jsx        # Main chat interface
│   │   │   ├── ChatsPage.jsx      # Chat list
│   │   │   ├── LandingPage.jsx    # Landing page
│   │   │   ├── MeetingsPage.jsx   # Video meetings
│   │   │   ├── Settings.jsx       # User settings
│   │   │   └── UserProfile.jsx    # Profile management
│   │   ├── context/       # React Context providers
│   │   │   └── AuthContext.jsx    # Authentication context
│   │   ├── services/      # API & Socket services
│   │   │   ├── api.js             # HTTP API client
│   │   │   └── socket.js          # Socket.IO client
│   │   ├── utils/         # Utility functions
│   │   │   └── cropImage.js       # Image cropping utility
│   │   ├── assets/        # Styles and animations
│   │   ├── App.jsx        # Main App component
│   │   └── main.jsx       # Application entry point
│   └── package.json
├── middleware/            # Express middlewares
│   ├── auth.js           # JWT authentication
│   ├── errorHandler.js   # Error handling
│   └── socketAuth.js     # Socket authentication
├── models/               # MongoDB schemas
│   ├── User.js          # User model
│   ├── Chat.js          # Chat room model
│   ├── Message.js       # Message model
│   ├── PrivateMessage.js # Private message model
│   ├── Room.js          # Room model
│   └── Meeting.js       # Meeting model
├── routes/              # API routes
│   ├── auth.js         # Authentication routes
│   ├── chat.js         # Chat routes
│   ├── room.js         # Room management
│   ├── meeting.js      # Meeting routes
│   └── upload.js       # File upload routes
├── utils/              # Server utilities
│   ├── fileHelpers.js # File handling
│   └── validation.js  # Input validation
├── server.js          # Express server & Socket.IO
├── package.json       # Server dependencies
└── README.md         # Project documentation
```

## 🔑 Key Features Explained

### Image Upload & Cropping
Users can upload custom profile pictures with built-in cropping functionality:
- 1:1 aspect ratio enforcement (square images)
- Zoom controls for precise cropping
- Real-time preview
- Base64 image encoding for storage

### Multi-Step Registration
The signup process is divided into two steps:
1. **Step 1**: Basic information (name, email, phone, password)
2. **Step 2**: Profile customization (avatar selection/upload, username, bio)

### Real-Time Communication
Socket.IO powers all real-time features:
- Message delivery and receipt
- Typing indicators
- User presence (online/offline/away/busy)
- Live notifications

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

This creates optimized production builds for both frontend and backend.

### Environment Variables for Production

Ensure all environment variables are properly set in your production environment, especially:
- `NODE_ENV=production`
- `MONGODB_URI` (production database)
- `JWT_SECRET` (strong secret key)
- `CLIENT_URL` (your production frontend URL)

## 📝 API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get current user
- `PATCH /api/auth/profile` - Update profile
- `PUT /api/auth/change-password` - Change password

### Chat
- `GET /api/chats` - Get all chats
- `POST /api/chats` - Create new chat
- `GET /api/chats/:id/messages` - Get chat messages
- `POST /api/chats/:id/messages` - Send message

### Rooms
- `GET /api/rooms` - Get all rooms
- `POST /api/rooms` - Create room
- `GET /api/rooms/:id` - Get room details
- `POST /api/rooms/:id/join` - Join room

### Meetings
- `GET /api/meetings` - Get meetings
- `POST /api/meetings` - Schedule meeting
- `GET /api/meetings/:id` - Get meeting details

## 🔒 Security Features

- **Password Hashing**: Bcrypt with salt rounds
- **JWT Tokens**: Secure authentication tokens
- **Rate Limiting**: API endpoint protection
- **Helmet**: Security headers
- **CORS**: Configured cross-origin requests
- **Input Validation**: Server-side validation
- **Socket Authentication**: Secured WebSocket connections

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👥 Authors

- **ViktorRez99** - [GitHub Profile](https://github.com/ViktorRez99)

## 🙏 Acknowledgments

- Socket.IO for real-time communication
- MongoDB for flexible data storage
- React team for the amazing framework
- Tailwind CSS for the utility-first approach
- Radix UI for accessible components

## 📞 Support

For support, email your-email@example.com or open an issue on GitHub.

---

**VaaniArc** - Connect • Collaborate • Create