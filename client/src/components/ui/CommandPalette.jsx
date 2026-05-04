import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, MessageCircle, Users, FileText, Hash, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const CommandPalette = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const commands = [
    { id: 'new-chat', icon: MessageCircle, label: 'New Direct Message', category: 'Commands' },
    { id: 'new-group', icon: Users, label: 'New Group', category: 'Commands' },
    { id: 'new-channel', icon: Hash, label: 'New Channel', category: 'Commands' },
    { id: 'settings', icon: FileText, label: 'Open Settings', category: 'Commands' },
  ];

  const recent = [
    { id: 'recent-1', icon: MessageCircle, label: 'Recent Chat 1', category: 'Recent' },
    { id: 'recent-2', icon: MessageCircle, label: 'Recent Chat 2', category: 'Recent' },
  ];

  const allItems = useMemo(() => query
    ? [...commands, ...recent].filter((item) =>
        item.label.toLowerCase().includes(query.toLowerCase())
      )
    : [...recent, ...commands],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query]
  );

  const categories = useMemo(() => [...new Set(allItems.map((i) => i.category))], [allItems]);

  useEffect(() => { setSelectedIndex(0); }, [query]);

  useEffect(() => {
    if (!open) { setQuery(''); setSelectedIndex(0); }
  }, [open]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, allItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        onClose();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [allItems.length, onClose]
  );

  useEffect(() => {
    if (open) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [open, handleKeyDown]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.8 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[100]"
            style={{ background: 'rgba(0,0,0,0.85)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[12%] left-1/2 -translate-x-1/2 w-[600px] max-w-[calc(100vw-24px)] max-h-[480px] z-[101] flex flex-col overflow-hidden rounded-2xl shadow-modal"
            style={{ background: 'var(--bg-elevated)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--border-strong)' }}
          >
            <div className="flex items-center gap-3 px-4 border-b border-bd">
              <Search className="w-5 h-5 text-tx-muted shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations, commands..."
                className="flex-1 bg-transparent text-base font-display text-tx-primary placeholder:text-tx-disabled py-4 outline-none"
                autoFocus
              />
              <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-tx-muted bg-void border border-bd rounded">
                ESC
              </kbd>
            </div>

            <div className="flex-1 overflow-y-auto py-2">
              {allItems.length === 0 && (
                <div className="px-4 py-8 text-center text-tx-muted text-sm font-ui">No results found</div>
              )}
              {categories.map((category) => (
                <div key={category}>
                  <div className="px-4 py-1.5 text-[10px] font-mono uppercase tracking-widest text-tx-muted">
                    {category}
                  </div>
                  {allItems
                    .filter((i) => i.category === category)
                    .map((item) => {
                      const globalIdx = allItems.indexOf(item);
                      return (
                        <button
                          key={item.id}
                          onClick={() => onClose()}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          className={cn(
                            'w-full flex items-center gap-3 px-4 py-2 text-sm transition-all duration-fast cursor-pointer',
                            globalIdx === selectedIndex
                              ? 'bg-selected text-tx-primary'
                              : 'text-tx-secondary hover:bg-hover/50'
                          )}
                        >
                          <div
                            className={cn(
                              'w-1 h-4 rounded-full shrink-0 transition-all',
                              globalIdx === selectedIndex ? 'bg-accent shadow-glow' : 'bg-transparent'
                            )}
                          />
                          <item.icon className="w-4 h-4 shrink-0 text-tx-muted" />
                          <span className="flex-1 text-left">{item.label}</span>
                          {globalIdx === selectedIndex && (
                            <ArrowRight className="w-3.5 h-3.5 text-tx-muted" />
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>

            <div className="flex items-center gap-4 px-4 py-2 border-t border-bd text-[10px] font-mono text-tx-muted">
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-void border border-bd rounded">↑↓</kbd> navigate</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-void border border-bd rounded">↵</kbd> select</span>
              <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-void border border-bd rounded">esc</kbd> close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CommandPalette;
