import { X, Mail, Calendar, Clock, User as UserIcon, MessageCircle, Phone, Video } from 'lucide-react';
import { useEffect, useState } from 'react';
import api from '../services/api';

const UserProfile = ({ user: initialUser, onClose, onStartChat }) => {
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialUser?._id) {
      fetchUserDetails();
    }
  }, [initialUser?._id]);

  const fetchUserDetails = async () => {
    if (!initialUser?._id) return;
    
    setLoading(true);
    try {
      const response = await api.get(`/users/${initialUser._id}`);
      setUser(response || initialUser);
    } catch (error) {
      console.error('Error fetching user details:', error);
      setUser(initialUser);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return (
      <div className="w-96 border-l border-[#2a2f32] bg-[#111b21] flex items-center justify-center">
        <p className="text-[#8696a0]">No user selected</p>
      </div>
    );
  }

  const formatDate = (date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatLastSeen = (date) => {
    const now = new Date();
    const lastSeen = new Date(date);
    const diff = now - lastSeen;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} minutes ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} hours ago`;
    return formatDate(date);
  };

  return (
    <div className="w-96 border-l border-[#2a2f32] bg-[#111b21] flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[#2a2f32] flex items-center justify-between bg-[#202c33]">
        <h3 className="text-lg font-semibold text-[#e9edef]">Contact Info</h3>
        <button
          onClick={onClose}
          className="p-2 hover:bg-slate-800/50 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="p-4 border-b border-[#2a2f32] flex items-center justify-around gap-3">
        <button
          onClick={() => {
            if (onStartChat) onStartChat(user._id);
            onClose();
          }}
          className="flex-1 flex flex-col items-center space-y-1 py-3 bg-[#202c33] hover:bg-[#2a3942] rounded-lg transition-colors focus:outline-none"
        >
          <MessageCircle className="w-6 h-6 text-[#00a884]" />
          <span className="text-xs text-[#8696a0]">Message</span>
        </button>
        <button className="flex-1 flex flex-col items-center space-y-1 py-3 bg-[#202c33] hover:bg-[#2a3942] rounded-lg transition-colors focus:outline-none">
          <Phone className="w-6 h-6 text-[#00a884]" />
          <span className="text-xs text-[#8696a0]">Audio</span>
        </button>
        <button className="flex-1 flex flex-col items-center space-y-1 py-3 bg-[#202c33] hover:bg-[#2a3942] rounded-lg transition-colors focus:outline-none">
          <Video className="w-6 h-6 text-[#00a884]" />
          <span className="text-xs text-[#8696a0]">Video</span>
        </button>
      </div>

      {/* Profile Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Avatar and Name */}
        <div className="p-6 text-center border-b border-[#2a2f32] bg-[#111b21]">
          <div className="w-32 h-32 mx-auto mb-4 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center">
            {user?.avatar ? (
              <img 
                src={user.avatar} 
                alt={user.username || 'User'} 
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <span className="text-4xl font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
            )}
          </div>
          <h2 className="text-2xl font-medium text-[#e9edef] mb-1">{user?.username || 'Unknown User'}</h2>
          <div className="flex items-center justify-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              user?.status === 'online' ? 'bg-green-500' : 'bg-gray-500'
            }`}></div>
            <span className="text-[#8696a0] text-sm">
              {user?.status === 'online' ? 'Online' : user?.lastSeen ? `Last seen ${formatLastSeen(user.lastSeen)}` : 'Offline'}
            </span>
          </div>
        </div>

        {/* About Section */}
        <div className="p-6 border-b border-[#2a2f32]">
          <h4 className="text-sm font-medium text-[#00a884] mb-3">About</h4>
          <p className="text-[#e9edef]">
            {user?.bio || 'Hey there! I am using VaaniArc'}
          </p>
        </div>

        {/* Contact Information */}
        <div className="p-6 border-b border-[#2a2f32] space-y-4">
          <h4 className="text-sm font-medium text-[#00a884] mb-3">Contact Info</h4>
          
          {user?.email && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
                <Mail className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <p className="text-xs text-[#8696a0]">Email</p>
                <p className="text-[#e9edef]">{user.email}</p>
              </div>
            </div>
          )}

          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
              <UserIcon className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-xs text-[#8696a0]">Username</p>
              <p className="text-[#e9edef]">@{user?.username || 'unknown'}</p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="p-6 space-y-4">
          <h4 className="text-sm font-medium text-[#00a884] mb-3">Additional Info</h4>
          
          {user?.joinedAt && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
                <Calendar className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-[#8696a0]">Joined</p>
                <p className="text-[#e9edef]">{formatDate(user.joinedAt)}</p>
              </div>
            </div>
          )}

          {user?.status !== 'online' && user?.lastSeen && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-slate-800/50 rounded-full flex items-center justify-center">
                <Clock className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xs text-[#8696a0]">Last Seen</p>
                <p className="text-[#e9edef]">{formatLastSeen(user.lastSeen)}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-[#2a2f32] space-y-2">
        <button className="w-full px-4 py-3 bg-[#202c33] hover:bg-[#2a3942] text-[#ea4335] rounded-lg transition-all flex items-center justify-center space-x-2 focus:outline-none">
          <span>Block {user?.username || 'User'}</span>
        </button>
        <button className="w-full px-4 py-3 bg-[#202c33] hover:bg-[#2a3942] text-[#e9edef] rounded-lg transition-all flex items-center justify-center space-x-2 focus:outline-none">
          <span>Clear Chat</span>
        </button>
      </div>
    </div>
  );
};

export default UserProfile;
