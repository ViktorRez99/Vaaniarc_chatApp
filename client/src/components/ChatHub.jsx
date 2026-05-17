import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  MessageCircle, Video, Users, Settings as SettingsIcon,
  Search, Plus, Zap, LogOut, Archive, FileText,
  Circle, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ChatsPage from './ChatsPage';
import MeetingsPage from './MeetingsPage';
import RuntimeStatusBanner from './RuntimeStatusBanner';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { AppShell, Avatar } from './ui';
import { cn } from '../lib/utils';

const ChatHub = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { meetingId } = useParams();
  const [activeTab, setActiveTab] = useState('chats');
  const { user, logout } = useAuth();
  const meetingsPageRef = useRef(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [currentStatus, setCurrentStatus] = useState(user?.status || 'online');
  const [showNewChatMenu, setShowNewChatMenu] = useState(false);
  const userMenuRef = useRef(null);
  const newChatMenuRef = useRef(null);

  useEffect(() => { if (user?.status) setCurrentStatus(user.status) }, [user]);
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    setActiveTab(meetingId || sp.get('tab') === 'meetings' ? 'meetings' : 'chats');
  }, [location.search, meetingId]);

  const handleStatusChange = async (status) => {
    setCurrentStatus(status); setShowStatusMenu(false);
    try {
      await api.patch('/auth/status', { status });
    } catch (statusError) {
      console.error('Failed to update user status:', statusError);
      setCurrentStatus(user?.status || 'online');
    }
  };

  const handleQuickMeeting = useCallback(() => {
    navigate('/chat?tab=meetings');
    setTimeout(() => { meetingsPageRef.current?.startInstantMeeting?.() }, 100);
  }, [navigate]);

  useEffect(() => { const h = () => handleQuickMeeting(); window.addEventListener('quickMeeting', h); return () => window.removeEventListener('quickMeeting', h) }, [handleQuickMeeting]);
  useEffect(() => {
    const h = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setShowUserMenu(false); if (newChatMenuRef.current && !newChatMenuRef.current.contains(e.target)) setShowNewChatMenu(false) };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const handleTabChange = (tab) => { setActiveTab(tab); navigate(tab === 'meetings' ? '/chat?tab=meetings' : '/chat') };

  const statusColors = { online: 'var(--accent)', away: 'var(--warning)', busy: 'var(--danger)', offline: 'var(--text-disabled)' };

  const tabItems = [
    { id: 'chats', label: 'Chats', icon: MessageCircle },
    { id: 'meetings', label: 'Meetings', icon: Video },
  ];

  const newChatActions = [
    { label: 'New Chat', icon: MessageCircle, color: 'text-accent', event: 'vaaniarc:open-direct-messages' },
    { label: 'New Group', icon: Users, color: 'text-info', events: ['vaaniarc:open-groups', 'vaaniarc:open-group-creator'] },
    { label: 'New Channel', icon: FileText, color: 'text-e2ee-quantum', events: ['vaaniarc:open-channels', 'vaaniarc:open-channel-creator'] },
    { label: 'New Community', icon: Users, color: 'text-success', events: ['vaaniarc:open-channels', 'vaaniarc:open-community-creator'] },
  ];

  const canvasHeader = (
    <div className="flex items-center justify-between h-14 px-4 border-b border-bd-subtle shrink-0">
      <div className="flex items-center gap-1 rounded-lg border border-bd p-0.5 bg-white/[0.02]">
        {tabItems.map((tab) => (
          <button key={tab.id} onClick={() => handleTabChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-ui font-medium transition-all duration-base cursor-pointer border-none',
              activeTab === tab.id ? 'bg-accent/10 text-accent' : 'bg-transparent text-tx-muted hover:text-tx-secondary'
            )}>
            <tab.icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={handleQuickMeeting}
          className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent text-void text-xs font-ui font-medium hover:brightness-110 transition-all cursor-pointer border-none shadow-glow active:scale-95">
          <Zap className="w-3.5 h-3.5" /><span>Quick Meet</span>
        </button>

        <div className="relative" ref={newChatMenuRef}>
          <button onClick={() => setShowNewChatMenu(!showNewChatMenu)}
            className="w-8 h-8 rounded-lg flex items-center justify-center bg-transparent hover:bg-hover/30 text-tx-secondary transition-all cursor-pointer border-none">
            <Plus className="w-5 h-5" />
          </button>
          <AnimatePresence>
            {showNewChatMenu && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-1 w-52 rounded-xl overflow-hidden z-50 glass-strong shadow-modal">
                {newChatActions.map((action) => (
                  <button key={action.label}
                    onClick={() => {
                      if (action.event) window.dispatchEvent(new Event(action.event));
                      if (action.events) action.events.forEach((evt, idx) => { if (idx === 1) window.setTimeout(() => window.dispatchEvent(new Event(evt)), 0); else window.dispatchEvent(new Event(evt)) });
                      setShowNewChatMenu(false);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-tx-secondary hover:bg-hover/30 transition-all text-xs font-ui group bg-transparent border-none cursor-pointer">
                    <action.icon className={cn('w-4 h-4', action.color)} />
                    <span className="font-medium">{action.label}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="relative" ref={userMenuRef}>
          <button onClick={() => setShowUserMenu(!showUserMenu)} className="cursor-pointer" title={user?.username || 'Profile'}>
            <Avatar src={user?.avatar} name={user?.username} size="sm" status={currentStatus} glowing={currentStatus === 'online'} />
          </button>
          <AnimatePresence>
            {showUserMenu && (
              <motion.div initial={{ opacity: 0, scale: 0.95, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-1 w-60 rounded-xl overflow-hidden z-50 glass-strong shadow-modal">
                <div className="p-3 border-b border-bd-subtle">
                  <div className="flex items-center gap-3">
                    <Avatar src={user?.avatar} name={user?.username} size="md" status={currentStatus} glowing={currentStatus === 'online'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-ui font-medium text-tx-primary truncate">{user?.username}</p>
                      <p className="text-[10px] font-mono text-tx-muted truncate">@{user?.username}</p>
                    </div>
                  </div>
                </div>
                <div className="py-1">
                  <button onClick={() => { navigate('/settings'); setShowUserMenu(false) }} className="w-full flex items-center gap-3 px-3 py-2 text-tx-secondary hover:bg-hover/30 transition-all text-xs font-ui bg-transparent border-none cursor-pointer">
                    <SettingsIcon className="w-4 h-4 text-tx-muted" /><span>Settings</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-tx-secondary hover:bg-hover/30 transition-all text-xs font-ui bg-transparent border-none cursor-pointer">
                    <Archive className="w-4 h-4 text-tx-muted" /><span>Archived Chats</span>
                  </button>
                  <button className="w-full flex items-center gap-3 px-3 py-2 text-tx-secondary hover:bg-hover/30 transition-all text-xs font-ui bg-transparent border-none cursor-pointer">
                    <FileText className="w-4 h-4 text-tx-muted" /><span>Starred Messages</span>
                  </button>
                  <div className="relative">
                    <button onClick={() => setShowStatusMenu(!showStatusMenu)} className="w-full flex items-center justify-between px-3 py-2 text-tx-secondary hover:bg-hover/30 transition-all text-xs font-ui bg-transparent border-none cursor-pointer">
                      <div className="flex items-center gap-3"><Circle className="w-3.5 h-3.5 fill-current" style={{ color: statusColors[currentStatus] }} /><span>Status</span></div>
                      <span className="text-[10px] font-mono text-tx-muted capitalize">{currentStatus}</span>
                    </button>
                    <AnimatePresence>
                      {showStatusMenu && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                          className="overflow-hidden mx-2 mb-1 rounded-lg border border-bd-subtle bg-void/50">
                          {['online', 'away', 'busy', 'offline'].map(s => (
                            <button key={s} onClick={() => handleStatusChange(s)}
                              className="w-full flex items-center gap-3 px-3 py-1.5 text-tx-secondary hover:bg-hover/30 transition-all text-xs font-ui bg-transparent border-none cursor-pointer">
                              <Circle className="w-3 h-3 fill-current" style={{ color: statusColors[s] }} /><span className="capitalize">{s}</span>
                              {currentStatus === s && <Check className="ml-auto w-3 h-3 text-accent" />}
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  <div className="border-t border-bd-subtle my-1" />
                  <button onClick={async () => { await logout(); navigate('/') }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-danger hover:bg-danger/10 transition-all text-xs font-ui font-medium bg-transparent border-none cursor-pointer">
                    <LogOut className="w-4 h-4" /><span>Logout</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );

  return (
    <AppShell sidebar={<div className="p-3"><RuntimeStatusBanner /></div>}>
      {canvasHeader}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'chats' && <ChatsPage />}
        {activeTab === 'meetings' && <MeetingsPage ref={meetingsPageRef} meetingIdFromRoute={meetingId} />}
      </div>
    </AppShell>
  );
};

export default ChatHub;
