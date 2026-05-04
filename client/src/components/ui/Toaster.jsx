import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

const iconMap = { success: CheckCircle, warning: AlertTriangle, error: AlertCircle, info: Info };
const colorMap = { success: 'text-success', warning: 'text-warning', error: 'text-danger', info: 'text-info' };
const glowMap = {
  success: 'drop-shadow(0 0 6px rgba(0,255,102,0.3))',
  warning: 'drop-shadow(0 0 6px rgba(255,176,32,0.3))',
  error: 'drop-shadow(0 0 6px rgba(255,68,102,0.3))',
  info: 'drop-shadow(0 0 6px rgba(0,240,255,0.3))',
};

let toastId = 0;
const listeners = new Set();
let toasts = [];

export function toast({ title, description, variant = 'info', duration = 4000 }) {
  const id = ++toastId;
  toasts = [...toasts, { id, title, description, variant, duration }];
  listeners.forEach((fn) => fn(toasts));
  if (duration > 0) {
    setTimeout(() => { toasts = toasts.filter((t) => t.id !== id); listeners.forEach((fn) => fn(toasts)); }, duration);
  }
  return id;
}

export function dismissToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
  listeners.forEach((fn) => fn(toasts));
}

export function Toaster() {
  const [currentToasts, setCurrentToasts] = useState([]);

  useEffect(() => {
    listeners.add(setCurrentToasts);
    return () => listeners.delete(setCurrentToasts);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {currentToasts.map((t) => {
          const Icon = iconMap[t.variant];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              layout
              className="pointer-events-auto flex items-start gap-3 w-80 max-w-[calc(100vw-24px)] p-3 rounded-xl glass"
            >
              <Icon className={cn('w-4 h-4 mt-0.5 shrink-0', colorMap[t.variant], glowMap[t.variant])} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-ui font-medium text-tx-primary">{t.title}</p>
                {t.description && <p className="text-xs text-tx-secondary mt-0.5">{t.description}</p>}
              </div>
              <button onClick={() => dismissToast(t.id)} className="text-tx-muted hover:text-tx-primary shrink-0 cursor-pointer bg-transparent border-none">
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
