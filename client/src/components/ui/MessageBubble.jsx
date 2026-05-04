import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCheck, Lock, Smile, Reply, Forward, Trash2 } from 'lucide-react';
import { cn } from '../../lib/utils';

const ChatBubble = ({
  content,
  isOwn,
  timestamp,
  status,
  isEncrypted,
  isQuantum,
  senderName,
  onReact,
  onReply,
  onForward,
  onDelete,
  replyTo,
  isEditing,
  editContent,
  onEditChange,
  onEditSave,
  onEditCancel,
  className,
}) => {
  const [showActions, setShowActions] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn('group flex mb-1.5 px-4', isOwn ? 'justify-end' : 'justify-start', className)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="relative max-w-[72%] min-w-[100px]">
        {!isOwn && senderName && (
          <span className="text-[11px] font-ui text-tx-muted mb-1 block pl-3">{senderName}</span>
        )}

        <AnimatePresence>
          {showActions && (
            <motion.div
              initial={{ opacity: 0, y: 4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                'absolute -top-9 flex items-center gap-0.5 px-1.5 py-1 rounded-xl z-10',
                isOwn ? 'right-2' : 'left-2'
              )}
              style={{ background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', border: '1px solid var(--glass-border)' }}
            >
              {onReact && (
                <button onClick={onReact} className="p-1.5 rounded-lg hover:bg-white/10 text-tx-secondary hover:text-tx-primary transition-all cursor-pointer bg-transparent border-none" title="React">
                  <Smile className="w-3.5 h-3.5" />
                </button>
              )}
              {onReply && (
                <button onClick={onReply} className="p-1.5 rounded-lg hover:bg-white/10 text-tx-secondary hover:text-tx-primary transition-all cursor-pointer bg-transparent border-none" title="Reply">
                  <Reply className="w-3.5 h-3.5" />
                </button>
              )}
              {onForward && (
                <button onClick={onForward} className="p-1.5 rounded-lg hover:bg-white/10 text-tx-secondary hover:text-tx-primary transition-all cursor-pointer bg-transparent border-none" title="Forward">
                  <Forward className="w-3.5 h-3.5" />
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-white/10 text-tx-secondary hover:text-danger transition-all cursor-pointer bg-transparent border-none" title="Delete">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={cn(
            'px-3.5 py-2.5',
            isOwn
              ? 'rounded-2xl rounded-br-sm'
              : 'rounded-2xl rounded-bl-sm'
          )}
          style={isOwn ? {
            background: 'linear-gradient(135deg, rgba(0,240,255,0.15) 0%, rgba(0,240,255,0.08) 100%)',
            border: '1px solid rgba(0,240,255,0.20)',
          } : {
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--border-default)',
          }}
        >
          {replyTo && (
            <div className="mb-2 pl-2.5 border-l-2 border-accent/40 text-xs text-tx-secondary">
              <span className="font-ui font-medium text-tx-primary">{replyTo.sender}</span>
              <p className="truncate">{replyTo.content}</p>
            </div>
          )}

          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                value={editContent}
                onChange={(e) => onEditChange?.(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onEditSave?.()}
                className="flex-1 bg-transparent border-b border-accent text-tx-primary text-sm outline-none py-1"
                autoFocus
              />
              <button onClick={onEditSave} className="text-xs text-accent hover:text-tx-primary cursor-pointer bg-transparent border-none">Save</button>
              <button onClick={onEditCancel} className="text-xs text-tx-muted hover:text-tx-primary cursor-pointer bg-transparent border-none">Cancel</button>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-tx-primary" style={{ fontFamily: 'var(--font-body)', fontSize: '14px' }}>
              {content}
            </p>
          )}

          <div className="flex items-center justify-end gap-1.5 mt-1">
            <span className="text-[10px] font-mono text-tx-muted">{timestamp}</span>
            {isQuantum && (
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-pill"
                style={{ background: 'rgba(192,132,252,0.12)', color: 'var(--e2ee-quantum)' }}
              >
                PQ-KEM
              </span>
            )}
            {isEncrypted && !isQuantum && (
              <Lock className="w-2.5 h-2.5" style={{ color: 'var(--e2ee-secure)', filter: 'drop-shadow(0 0 4px rgba(0,240,255,0.4))' }} />
            )}
            {isOwn && (
              <span className="text-tx-muted">
                {status === 'sent' && <Check className="w-3 h-3" />}
                {status === 'delivered' && <CheckCheck className="w-3 h-3" />}
                {status === 'read' && <CheckCheck className="w-3 h-3" style={{ color: 'var(--accent)', filter: 'drop-shadow(0 0 4px rgba(0,240,255,0.5))' }} />}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ChatBubble;
export { ChatBubble as MessageBubble };
