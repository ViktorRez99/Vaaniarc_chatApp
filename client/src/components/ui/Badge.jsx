import { cn } from '../../lib/utils';

const Badge = ({ children, variant = 'default', count, glowing, className, ...props }) => {
  const variants = {
    default: 'bg-elevated text-tx-secondary border border-bd',
    accent: 'bg-accent-dim text-accent border border-bd-accent',
    danger: 'bg-danger/10 text-danger border border-danger/20',
    warning: 'bg-warning/10 text-warning border border-warning/20',
    success: 'bg-emerald-dim text-success border border-success/20',
    quantum: 'bg-e2ee-quantum/10 text-e2ee-quantum border border-e2ee-quantum/20',
    muted: 'bg-hover text-tx-muted border border-bd-subtle',
    neon: 'bg-accent-dim text-accent border border-bd-accent',
  };

  if (count !== undefined) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-pill text-[10px] font-mono font-medium',
          variant === 'neon' ? 'bg-accent text-void shadow-glow' : variants[variant],
          glowing && 'animate-glow-pulse',
          className
        )}
        {...props}
      >
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-pill text-[10px] font-mono uppercase tracking-wider',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
