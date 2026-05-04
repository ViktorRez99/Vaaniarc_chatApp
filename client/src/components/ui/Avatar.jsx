import { cn } from '../../lib/utils';

const Avatar = ({ src, name, size = 'md', status, glowing, className, ...props }) => {
  const sizes = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  };

  const statusColors = {
    online: 'var(--accent)',
    away: 'var(--warning)',
    busy: 'var(--danger)',
    offline: 'var(--text-disabled)',
    typing: 'var(--accent)',
  };

  const initial = name?.[0]?.toUpperCase() || '?';

  const generateColor = (str) => {
    let hash = 0;
    for (let i = 0; i < (str || '').length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 30%, 15%)`;
  };

  return (
    <div className={cn('relative inline-flex shrink-0', className)} {...props}>
      <div
        className={cn(
          'rounded-xl flex items-center justify-center overflow-hidden font-display font-semibold',
          sizes[size],
          glowing && 'animate-ring-pulse'
        )}
        style={{
          background: src ? 'transparent' : generateColor(name),
          ...(glowing ? { boxShadow: `0 0 0 2px var(--bg-base), 0 0 0 4px ${statusColors[status] || 'var(--accent)'}` } : {}),
        }}
      >
        {src ? (
          <img src={src} alt={name || ''} className="w-full h-full object-cover" />
        ) : (
          <span className="text-tx-primary">{initial}</span>
        )}
      </div>
      {status && (
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-void',
            size === 'xs' ? 'w-2 h-2' : size === 'sm' ? 'w-2.5 h-2.5' : 'w-3 h-3'
          )}
          style={{
            backgroundColor: statusColors[status],
            ...(status === 'typing'
              ? { borderStyle: 'dashed', animation: 'presence-typing 1s linear infinite' }
              : {}),
            ...(status === 'online' ? { boxShadow: `0 0 6px ${statusColors[status]}` } : {}),
          }}
        />
      )}
    </div>
  );
};

export default Avatar;
