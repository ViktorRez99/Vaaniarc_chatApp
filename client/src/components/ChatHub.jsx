import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Video, Users, Settings as SettingsIcon, Search, Plus, Zap, LogOut, Archive, FileText, Circle, Check } from 'lucide-react';
import ChatsPage from './ChatsPage';
import MeetingsPage from './MeetingsPage';
import SettingsPage from './Settings';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const ChatHub = () => {
  const [activeTab, setActiveTab] = useState('chats');
  const { user, logout } = useAuth();
  const meetingsPageRef = useRef(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(user?.status || 'online');
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    if (user?.status) {
      setCurrentStatus(user.status);
    }
  }, [user]);

  const handleStatusChange = async (status) => {
    setCurrentStatus(status);
    setShowStatusMenu(false);
    try {
      await api.patch('/auth/status', { status });
    } catch (error) {
      console.error('Failed to update status:', error);
      setCurrentStatus(user?.status || 'online');
    }
  };

  useEffect(() => {
    const handleQuickMeetingEvent = () => {
      handleQuickMeeting();
    };

    window.addEventListener('quickMeeting', handleQuickMeetingEvent);

    return () => {
      window.removeEventListener('quickMeeting', handleQuickMeetingEvent);
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQuickMeeting = async () => {
    setActiveTab('meetings');

    setTimeout(() => {
      if (meetingsPageRef.current) {
        meetingsPageRef.current.startInstantMeeting();
      }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 text-slate-50">
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-950/90 backdrop-blur-xl border-b border-slate-800 shadow-lg">
        <div className="container mx-auto px-4 md:px-6 max-w-7xl">
          <div className="flex items-center justify-between h-16 md:h-20 gap-4">
            <div className="flex items-center space-x-3 flex-shrink-0">
              <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-sky-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <MessageCircle className="w-5 h-5 md:w-6 md:h-6 text-white" />
              </div>
              <span className="text-xl md:text-2xl font-bold bg-gradient-to-r from-sky-100 to-indigo-200 bg-clip-text text-transparent">
                VaaniArc
              </span>
            </div>

            <div className="flex items-center space-x-2 rounded-2xl px-3 py-2 border border-slate-700 bg-slate-900/80 backdrop-blur-xl">
              <button
                onClick={() => setActiveTab('chats')}
                className={`flex items-center space-x-2 px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-sm md:text-base font-medium transition-all ${
                  activeTab === 'chats'
                    ? 'text-sky-100 bg-sky-700/60 ring-1 ring-sky-400/70 shadow-md'
                    : 'text-slate-300 hover:text-sky-100 hover:bg-slate-800'
                }`}
              >
                <MessageCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Chats</span>
              </button>
              <button
                onClick={() => setActiveTab('meetings')}
                className={`flex items-center space-x-2 px-4 md:px-5 py-2 md:py-2.5 rounded-xl text-sm md:text-base font-medium transition-all ${
                  activeTab === 'meetings'
                    ? 'text-sky-100 bg-sky-700/60 ring-1 ring-sky-400/70 shadow-md'
                    : 'text-slate-300 hover:text-sky-100 hover:bg-slate-800'
                }`}
              >
                <Video className="w-4 h-4" />
                <span className="hidden sm:inline">Meetings</span>
              </button>
            </div>

            <div className="flex items-center space-x-3 flex-shrink-0">
              <button
                onClick={handleQuickMeeting}
                className="hidden lg:flex items-center space-x-2 px-4 md:px-5 py-2 md:py-2.5 bg-gradient-to-br from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/40 text-sm md:text-base font-medium"
                title="Start instant meeting"
              >
                <Zap className="w-4 h-4" />
                <span>Quick Meet</span>
              </button>

              <div className="relative">
                <button
                  onClick={() => setShowNewChatMenu(!showNewChatMenu)}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 flex items-center justify-center shadow-lg hover:shadow-sky-500/40 transition-all"
                  title="New chat or group"
                >
                  <Plus className="w-5 h-5" />
                </button>

                {showNewChatMenu && (
                  <div className="absolute right-0 mt-2 w-60 bg-slate-900/95 backdrop-blur-xl border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <button className="w-full flex items-center space-x-3 px-4 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                      <MessageCircle className="w-5 h-5 text-sky-400" />
                      <span>New Chat</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-4 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                      <Users className="w-5 h-5 text-sky-400" />
                      <span>New Group</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-4 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                      <FileText className="w-5 h-5 text-sky-400" />
                      <span>New Channel</span>
                    </button>
                    <div className="border-t border-slate-700"></div>
                    <button className="w-full flex items-center space-x-3 px-4 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                      <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold">W</span>
                      <span>Share to WhatsApp</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-4 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                      <span className="w-5 h-5 rounded-full bg-blue-400 flex items-center justify-center text-xs font-bold">T</span>
                      <span>Share to Telegram</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="relative" ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="relative w-10 h-10 md:w-11 md:h-11 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center hover:ring-2 hover:ring-sky-400/50 transition-all cursor-pointer shadow-lg"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <span className="text-sm md:text-base font-semibold">{user?.username?.[0]?.toUpperCase()}</span>
                  )}
                  <span className={`absolute bottom-0 right-0 w-3 h-3 md:w-3.5 md:h-3.5 rounded-full border-2 border-slate-950 ${
                    currentStatus === 'online' ? 'bg-green-400' :
                    currentStatus === 'away' ? 'bg-yellow-400' :
                    currentStatus === 'busy' ? 'bg-red-400' :
                    'bg-gray-400'
                  }`}></span>
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-3 w-80 bg-slate-900/95 backdrop-blur-2xl border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="p-5 border-b border-slate-700 bg-gradient-to-br from-sky-900/30 to-indigo-900/30">
                      <div className="flex items-center space-x-4">
                        <div className="relative w-14 h-14 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg">
                          {user?.avatar ? (
                            <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span className="text-xl font-semibold">{user?.username?.[0]?.toUpperCase()}</span>
                          )}
                          <span className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-slate-900 ${
                            currentStatus === 'online' ? 'bg-green-400' :
                            currentStatus === 'away' ? 'bg-yellow-400' :
                            currentStatus === 'busy' ? 'bg-red-400' :
                            'bg-gray-400'
                          }`}></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-100 truncate text-lg">{user?.username}</p>
                          <p className="text-sm text-slate-400 truncate">{user?.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="py-2">
                      <button
                        onClick={() => {
                          setActiveTab('settings');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-5 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base"
                      >
                        <SettingsIcon className="w-5 h-5 text-sky-400" />
                        <span>Settings</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-5 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                        <Archive className="w-5 h-5 text-sky-400" />
                        <span>Archived Chats</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-5 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                        <FileText className="w-5 h-5 text-yellow-400" />
                        <span>Starred Messages</span>
                      </button>

                      <div className="relative">
                        <button 
                          onClick={() => setShowStatusMenu(!showStatusMenu)}
                          className="w-full flex items-center justify-between px-5 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base"
                        >
                          <div className="flex items-center space-x-3">
                            <Circle className={`w-4 h-4 fill-current ${
                              currentStatus === 'online' ? 'text-green-400' :
                              currentStatus === 'away' ? 'text-yellow-400' :
                              currentStatus === 'busy' ? 'text-red-400' :
                              'text-gray-400'
                            }`} />
                            <span>Status</span>
                          </div>
                          <span className="text-sm text-slate-400 capitalize font-medium">{currentStatus}</span>
                        </button>

                        {showStatusMenu && (
                          <div className="mx-4 mb-2 bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-xl overflow-hidden">
                            {['online', 'away', 'busy', 'offline'].map(status => (
                              <button
                                key={status}
                                onClick={() => handleStatusChange(status)}
                                className="w-full flex items-center space-x-3 px-4 py-3 text-slate-200 hover:bg-slate-700 transition-all text-base"
                              >
                                <Circle className={`w-3.5 h-3.5 fill-current ${
                                  status === 'online' ? 'text-green-400' :
                                  status === 'away' ? 'text-yellow-400' :
                                  status === 'busy' ? 'text-red-400' :
                                  'text-gray-400'
                                }`} />
                                <span className="capitalize">{status}</span>
                                {currentStatus === status && (
                                  <Check className="ml-auto w-4 h-4 text-green-400" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-700 my-2"></div>
                      <div className="px-5 py-2">
                        <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Connect</p>
                      </div>
                      <button className="w-full flex items-center space-x-3 px-5 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                        <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-xs font-bold">W</span>
                        <span>Link WhatsApp</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-5 py-3.5 text-slate-100 hover:bg-slate-800 transition-all text-base">
                        <span className="w-5 h-5 rounded-full bg-blue-400 flex items-center justify-center text-xs font-bold">T</span>
                        <span>Link Telegram</span>
                      </button>

                      <div className="border-t border-slate-700 my-2"></div>
                      <button
                        onClick={async () => {
                          await logout();
                          window.location.href = '/';
                        }}
                        className="w-full flex items-center space-x-3 px-5 py-3.5 text-red-400 hover:bg-red-500/10 transition-all text-base font-medium"
                      >
                        <LogOut className="w-5 h-5" />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="pt-16 md:pt-20">
        {activeTab === 'chats' && <ChatsPage />}
        {activeTab === 'meetings' && <MeetingsPage ref={meetingsPageRef} />}
        {activeTab === 'settings' && <SettingsPage user={user} onLogout={logout} onBack={() => setActiveTab('chats')} />}
      </main>
    </div>
  );
};

export default ChatHub;
