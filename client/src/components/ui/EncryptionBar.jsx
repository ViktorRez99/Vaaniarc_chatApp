import { motion } from 'framer-motion';
import { Lock, ChevronDown } from 'lucide-react';

const EncryptionBar = ({ algorithm = 'ML-KEM-768 + ML-DSA-65', fingerprint, onVerify }) => {
  const displayFingerprint = fingerprint
    ? `...${fingerprint.slice(-8)}`
    : '...00000000';

  return (
    <div className="flex items-center justify-between h-7 px-4 border-b border-bd-subtle bg-transparent">
      <div className="flex items-center gap-1.5">
        <Lock className="w-3 h-3 text-accent" style={{ filter: 'drop-shadow(0 0 4px rgba(0,240,255,0.3))' }} />
        <span className="text-[11px] font-mono text-tx-muted">
          End-to-End Encrypted · {algorithm}
        </span>
      </div>
      <button
        onClick={onVerify}
        className="flex items-center gap-1 text-[11px] font-mono text-tx-muted hover:text-accent transition-colors-fast cursor-pointer bg-transparent border-none"
      >
        <span>{displayFingerprint}</span>
        <ChevronDown className="w-3 h-3" />
      </button>
    </div>
  );
};

export default EncryptionBar;
