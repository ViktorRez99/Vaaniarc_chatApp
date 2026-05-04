import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  MessageCircle, Video, Users, Settings as SettingsIcon,
  Shield, Sparkles, Search, Menu, X, ChevronLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Avatar from './Avatar';
import StealthVaultToggle from './StealthVaultToggle';
import CommandPalette from './CommandPalette';
import { cn } from '../../lib/utils';

const sidebarSpring = { type: 'spring', stiffness: 300, damping: 30 };

const railItems = [
  { id: 'chats', icon: MessageCircle, label: 'Chats', path: '/chat' },
  { id: 'groups', icon: Users, label: 'Groups', path: '/chat?tab=groups' },
  { id: 'calls', icon: Video, label: 'Calls', path: '/chat?tab=meetings' },
  { id: 'ai', icon: Sparkles, label: 'AI', path: '/chat?tab=ai' },
];

const AppShell = ({ children, sidebar }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [vaultActive, setVaultActive] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeItem = railItems.find((item) => {
    if (item.id === 'chats' && location.pathname === '/chat' && !location.search) return true;
    if (item.id === 'groups' && location.search === '?tab=groups') return true;
    if (item.id === 'calls' && location.search === '?tab=meetings') return true;
    return false;
  }) || railItems[0];

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-void noise-overlay">
      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />

      {/* ── Rail (56px) ── */}
      <aside className="hidden md:flex flex-col items-center w-14 shrink-0 bg-panel/50 border-r border-bd-subtle py-3 gap-1 z-30" style={{ backdropFilter: 'var(--glass-blur)' }}>
        <div className="w-8 h-8 rounded-xl bg-accent/10 border border-bd-accent flex items-center justify-center mb-4">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M8 1L14 4.5V11.5L8 15L2 11.5V4.5L8 1Z" stroke="var(--accent)" strokeWidth="1.5" fill="none" />
            <circle cx="8" cy="8" r="2" fill="var(--accent)" opacity="0.4" />
          </svg>
        </div>

        <nav className="flex flex-col items-center gap-1 flex-1">
          {railItems.map((item) => {
            const isActive = activeItem.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                className={cn(
                  'relative flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-base cursor-pointer group',
                  isActive
                    ? 'text-accent bg-accent/10'
                    : 'text-tx-muted hover:text-tx-secondary hover:bg-hover/50'
                )}
                title={item.label}
              >
                {isActive && (
                  <motion.div
                    layoutId="rail-indicator"
                    className="absolute -left-[8px] top-2.5 bottom-2.5 w-0.5 rounded-full bg-accent shadow-glow"
                    transition={sidebarSpring}
                  />
                )}
                <item.icon className="w-5 h-5" strokeWidth={1.5} />
              </button>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-2 pt-2 border-t border-bd-subtle w-full px-2">
          <StealthVaultToggle active={vaultActive} onToggle={() => setVaultActive(!vaultActive)} />
          <button
            onClick={() => navigate('/settings')}
            className="cursor-pointer"
            title={user?.username || 'Profile'}
          >
            <Avatar src={user?.avatar} name={user?.username} size="sm" status={user?.status} glowing={user?.status === 'online'} />
          </button>
        </div>
      </aside>

      {/* ── Sidebar (280px, collapsible) ── */}
      <AnimatePresence mode="wait">
        {(sidebarOpen || mobileMenuOpen) && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={sidebarSpring}
            className="shrink-0 bg-panel/30 border-r border-bd-subtle flex flex-col overflow-hidden z-20"
            style={{ backdropFilter: 'var(--glass-blur)' }}
          >
            <div className="flex items-center gap-2 px-3 h-14 border-b border-bd-subtle shrink-0">
              <div className="flex-1 min-w-0">
                <h2 className="text-sm font-display font-semibold text-tx-primary tracking-tight">Messages</h2>
              </div>
              <button
                onClick={() => setCommandOpen(true)}
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/[0.06] bg-white/[0.03] text-tx-muted hover:bg-white/[0.06] hover:border-accent/20 hover:text-tx-secondary transition-all cursor-pointer text-xs font-mono"
                title="Search (⌘K)"
              >
                <Search className="w-3.5 h-3.5" />
                <span className="hidden lg:inline">⌘K</span>
              </button>
              <button
                onClick={toggleSidebar}
                className="hidden md:flex items-center justify-center w-7 h-7 rounded-lg text-tx-muted hover:text-tx-secondary hover:bg-hover/50 transition-all cursor-pointer bg-transparent border-none"
                title="Toggle sidebar"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="md:hidden flex items-center justify-center w-7 h-7 rounded-lg text-tx-muted hover:text-tx-secondary hover:bg-hover/50 transition-all cursor-pointer bg-transparent border-none"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {sidebar || (
                <div className="p-3">
                  <div className="space-y-1">
                    {['Pinned', 'Direct', 'Groups'].map((section) => (
                      <div key={section}>
                        <div className="px-2 py-1.5 text-[10px] font-mono uppercase tracking-widest text-tx-muted">{section}</div>
                        {[1, 2].map((i) => (
                          <div
                            key={i}
                            className="flex items-center gap-3 px-2.5 py-2.5 rounded-xl hover:bg-hover/30 transition-all cursor-pointer group"
                          >
                            <Avatar name={`Contact ${i}`} size="sm" status={i === 1 ? 'online' : undefined} glowing={i === 1} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-ui text-tx-primary truncate">Contact {i}</span>
                                <span className="text-[10px] font-mono text-tx-muted">12:{i}0</span>
                              </div>
                              <p className="text-xs text-tx-secondary truncate">Last message preview...</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ── Mobile hamburger ── */}
      {!mobileMenuOpen && (
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="md:hidden fixed top-3 left-3 z-40 flex items-center justify-center w-10 h-10 rounded-xl glass cursor-pointer"
        >
          <Menu className="w-5 h-5 text-tx-secondary" />
        </button>
      )}

      {/* ── Main Canvas ── */}
      <main className="flex-1 min-w-0 flex flex-col bg-void relative">
        {!sidebarOpen && (
          <button
            onClick={toggleSidebar}
            className="hidden md:flex absolute top-3 left-3 z-10 items-center justify-center w-8 h-8 rounded-lg glass text-tx-muted hover:text-tx-secondary transition-all cursor-pointer border-none"
          >
            <Menu className="w-4 h-4" />
          </button>
        )}
        {children}
      </main>
    </div>
  );
};

export default AppShell;
