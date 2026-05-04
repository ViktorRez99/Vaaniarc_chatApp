import { motion } from 'framer-motion';
import { Shield, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';

const StealthVaultToggle = ({ active, onToggle }) => {
  return (
    <button
      onClick={onToggle}
      className={cn(
        'relative flex items-center justify-center w-9 h-9 rounded-xl transition-all duration-300 cursor-pointer border-none',
        active
          ? 'text-danger bg-danger/10 animate-border-glow'
          : 'text-tx-muted hover:text-tx-secondary hover:bg-hover/50 bg-transparent'
      )}
      style={active ? { borderColor: 'rgba(255,68,102,0.30)' } : {}}
      title={active ? 'Stealth Vault Active — Dummy Profile Visible' : 'Activate Stealth Vault'}
    >
      {active ? (
        <motion.div
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ShieldAlert className="w-5 h-5" />
        </motion.div>
      ) : (
        <Shield className="w-5 h-5" />
      )}
    </button>
  );
};

export default StealthVaultToggle;
