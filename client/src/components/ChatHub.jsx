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
  const newChatMenuRef = useRef(null);

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
      if (newChatMenuRef.current && !newChatMenuRef.current.contains(event.target)) {
        setShowNewChatMenu(false);
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
      <header className="fixed top-0 left-0 right-0 z-50 bg-slate-900/10 backdrop-blur-[40px] border-b border-white/5 shadow-2xl supports-[backdrop-filter]:bg-slate-900/10">
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

              <div className="relative" ref={newChatMenuRef}>
                <button
                  onClick={() => setShowNewChatMenu(!showNewChatMenu)}
                  className="w-10 h-10 md:w-11 md:h-11 rounded-full bg-transparent hover:bg-white/10 border-none flex items-center justify-center transition-all"
                  title="New chat or group"
                >
                  <Plus className="w-6 h-6 text-white" />
                </button>

                {showNewChatMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                      <div className="p-1.5 rounded-full bg-sky-500/10 group-hover:bg-sky-500/20 transition-colors">
                        <MessageCircle className="w-4 h-4 text-sky-400" />
                      </div>
                      <span className="font-medium">New Chat</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                      <div className="p-1.5 rounded-full bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                        <Users className="w-4 h-4 text-indigo-400" />
                      </div>
                      <span className="font-medium">New Group</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                      <div className="p-1.5 rounded-full bg-purple-500/10 group-hover:bg-purple-500/20 transition-colors">
                        <FileText className="w-4 h-4 text-purple-400" />
                      </div>
                      <span className="font-medium">New Channel</span>
                    </button>
                    
                    <div className="border-t border-white/10 my-1"></div>
                    
                    <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                      <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                        <span className="text-green-400 font-bold text-xs">W</span>
                      </div>
                      <span className="font-medium">Share to WhatsApp</span>
                    </button>
                    <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                      <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                        <span className="text-blue-400 font-bold text-xs">T</span>
                      </div>
                      <span className="font-medium">Share to Telegram</span>
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
                  <div className="absolute right-0 mt-2 w-64 bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">
                    <div className="p-4 border-b border-white/10 bg-white/5">
                      <div className="flex items-center space-x-3">
                        <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg">
                          {user?.avatar ? (
                            <img src={user.avatar} alt={user.username} className="w-full h-full rounded-full object-cover" />
                          ) : (
                            <span className="text-lg font-semibold">{user?.username?.[0]?.toUpperCase()}</span>
                          )}
                          <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                            currentStatus === 'online' ? 'bg-green-400' :
                            currentStatus === 'away' ? 'bg-yellow-400' :
                            currentStatus === 'busy' ? 'bg-red-400' :
                            'bg-gray-400'
                          }`}></span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-100 truncate text-sm">{user?.username}</p>
                          <p className="text-xs text-slate-400 truncate">{user?.email}</p>
                        </div>
                      </div>
                    </div>

                    <div className="py-1">
                      <button
                        onClick={() => {
                          setActiveTab('settings');
                          setShowUserMenu(false);
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none"
                      >
                        <div className="p-1.5 rounded-full bg-sky-500/10 group-hover:bg-sky-500/20 transition-colors">
                          <SettingsIcon className="w-4 h-4 text-sky-400" />
                        </div>
                        <span className="font-medium">Settings</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                        <div className="p-1.5 rounded-full bg-indigo-500/10 group-hover:bg-indigo-500/20 transition-colors">
                          <Archive className="w-4 h-4 text-indigo-400" />
                        </div>
                        <span className="font-medium">Archived Chats</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                        <div className="p-1.5 rounded-full bg-yellow-500/10 group-hover:bg-yellow-500/20 transition-colors">
                          <FileText className="w-4 h-4 text-yellow-400" />
                        </div>
                        <span className="font-medium">Starred Messages</span>
                      </button>

                      <div className="relative">
                        <button 
                          onClick={() => setShowStatusMenu(!showStatusMenu)}
                          className="w-full flex items-center justify-between px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-1.5 rounded-full transition-colors ${
                              currentStatus === 'online' ? 'bg-green-500/10 group-hover:bg-green-500/20' :
                              currentStatus === 'away' ? 'bg-yellow-500/10 group-hover:bg-yellow-500/20' :
                              currentStatus === 'busy' ? 'bg-red-500/10 group-hover:bg-red-500/20' :
                              'bg-gray-500/10 group-hover:bg-gray-500/20'
                            }`}>
                              <Circle className={`w-3.5 h-3.5 fill-current ${
                                currentStatus === 'online' ? 'text-green-400' :
                                currentStatus === 'away' ? 'text-yellow-400' :
                                currentStatus === 'busy' ? 'text-red-400' :
                                'text-gray-400'
                              }`} />
                            </div>
                            <span className="font-medium">Status</span>
                          </div>
                          <span className="text-xs text-slate-400 capitalize font-medium">{currentStatus}</span>
                        </button>

                        {showStatusMenu && (
                          <div className="mx-3 mb-1 bg-black/20 backdrop-blur-xl border border-white/10 rounded-lg overflow-hidden">
                            {['online', 'away', 'busy', 'offline'].map(status => (
                              <button
                                key={status}
                                onClick={() => handleStatusChange(status)}
                                className="w-full flex items-center space-x-3 px-3 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm bg-transparent border-none"
                              >
                                <Circle className={`w-3 h-3 fill-current ${
                                  status === 'online' ? 'text-green-400' :
                                  status === 'away' ? 'text-yellow-400' :
                                  status === 'busy' ? 'text-red-400' :
                                  'text-gray-400'
                                }`} />
                                <span className="capitalize">{status}</span>
                                {currentStatus === status && (
                                  <Check className="ml-auto w-3.5 h-3.5 text-green-400" />
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-white/10 my-1"></div>
                      <div className="px-4 py-1.5">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Connect</p>
                      </div>
                      <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                        <div className="w-7 h-7 rounded-full bg-green-500/10 flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                          <span className="text-green-400 font-bold text-xs">W</span>
                        </div>
                        <span className="font-medium">Link WhatsApp</span>
                      </button>
                      <button className="w-full flex items-center space-x-3 px-4 py-2 text-slate-200 hover:bg-white/10 transition-all text-sm group bg-transparent border-none">
                        <div className="w-7 h-7 rounded-full bg-blue-500/10 flex items-center justify-center group-hover:bg-blue-500/20 transition-colors">
                          <span className="text-blue-400 font-bold text-xs">T</span>
                        </div>
                        <span className="font-medium">Link Telegram</span>
                      </button>

                      <div className="border-t border-white/10 my-1"></div>
                      <button
                        onClick={async () => {
                          await logout();
                          window.location.href = '/';
                        }}
                        className="w-full flex items-center space-x-3 px-4 py-2 text-red-400 hover:bg-red-500/10 transition-all text-sm font-medium group bg-transparent border-none"
                      >
                        <div className="p-1.5 rounded-full bg-red-500/10 group-hover:bg-red-500/20 transition-colors">
                          <LogOut className="w-4 h-4" />
                        </div>
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
