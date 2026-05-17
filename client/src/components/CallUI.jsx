import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff,
  Volume2, VolumeX
} from 'lucide-react';
import { CALL_STATES } from '../services/voiceCallManager';

/**
 * IncomingCallModal - Modal for incoming voice/video calls
 */
const IncomingCallModal = ({ callData, onAccept, onReject }) => {
  const [isRinging, setIsRinging] = useState(true);

  useEffect(() => {
    const ringInterval = setInterval(() => {
      setIsRinging(prev => !prev);
    }, 1000);

    return () => clearInterval(ringInterval);
  }, []);

  if (!callData) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-[#1a1d24] rounded-[2rem] p-8 max-w-sm w-full mx-4 border border-white/10 shadow-2xl"
      >
        {/* Caller Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className={`relative w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-4 ${
            isRinging ? 'ring-4 ring-accent/30' : ''
          } transition-all duration-300`}
            style={{
              background: 'linear-gradient(135deg, rgba(0,240,255,0.25) 0%, rgba(0,255,102,0.12) 100%)'
            }}
          >
            {callData.callerAvatar ? (
              <img src={callData.callerAvatar} alt={callData.callerName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white">
                {callData.callerName?.[0]?.toUpperCase() || 'U'}
              </span>
            )}
            <div className={`absolute inset-0 rounded-full ${
              isRinging ? 'bg-accent/10 animate-pulse' : ''
            }`} />
          </div>

          <h3 className="text-xl font-semibold text-white mb-1">
            {callData.callerName || 'Unknown'}
          </h3>
          <p className="text-white/60 text-sm">
            {callData.callType === 'video' ? 'Video' : 'Voice'} call
          </p>
          <p className="text-accent text-sm mt-2">
            {isRinging ? 'Incoming call...' : 'Incoming call'}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-8">
          <button
            onClick={onReject}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30 group-hover:scale-105 active:scale-95">
              <PhoneOff className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <span className="text-white/80 text-sm">Decline</span>
          </button>

          <button
            onClick={onAccept}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all shadow-lg shadow-green-500/30 group-hover:scale-105 active:scale-95">
              <Phone className="w-6 h-6 text-white rotate-[-135deg]" strokeWidth={2} />
            </div>
            <span className="text-white/80 text-sm">Accept</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

/**
 * OutgoingCallModal - Modal for outgoing voice/video calls
 */
const OutgoingCallModal = ({ callData, onCancel }) => {
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const pulseInterval = setInterval(() => setPulse(prev => !prev), 1000);
    return () => clearInterval(pulseInterval);
  }, []);

  if (!callData) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="bg-[#1a1d24] rounded-[2rem] p-8 max-w-sm w-full mx-4 border border-white/10 shadow-2xl"
      >
        {/* Recipient Avatar */}
        <div className="flex flex-col items-center mb-6">
          <div className={`relative w-24 h-24 rounded-full flex items-center justify-center overflow-hidden mb-4 ${
            pulse ? 'ring-4 ring-accent/30' : ''
          } transition-all duration-300`}
            style={{
              background: 'linear-gradient(135deg, rgba(0,240,255,0.25) 0%, rgba(0,255,102,0.12) 100%)'
            }}
          >
            {callData.recipientAvatar ? (
              <img src={callData.recipientAvatar} alt={callData.recipientName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-bold text-white">
                {callData.recipientName?.[0]?.toUpperCase() || 'U'}
              </span>
            )}
            <div className={`absolute inset-0 rounded-full ${
              pulse ? 'bg-accent/10 animate-pulse' : ''
            }`} />
          </div>

          <h3 className="text-xl font-semibold text-white mb-1">
            {callData.recipientName || 'Unknown'}
          </h3>
          <p className="text-white/60 text-sm">
            {callData.callType === 'video' ? 'Video' : 'Voice'} call
          </p>
          <p className="text-accent text-sm mt-2">
            {pulse ? 'Ringing...' : 'Calling...'}
          </p>
        </div>

        {/* Cancel Button */}
        <div className="flex items-center justify-center">
          <button
            onClick={onCancel}
            className="flex flex-col items-center gap-2 group"
          >
            <div className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30 group-hover:scale-105 active:scale-95">
              <PhoneOff className="w-6 h-6 text-white" strokeWidth={2} />
            </div>
            <span className="text-white/80 text-sm">Cancel</span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

/**
 * ActiveCallUI - WhatsApp-style active call UI
 */
const ActiveCallUI = ({
  callState,
  callData,
  localStream,
  remoteStream,
  isMicEnabled,
  isCameraEnabled,
  isSpeakerEnabled,
  onToggleMic,
  onToggleCamera,
  onToggleSpeaker,
  onEndCall
}) => {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const [localPosition, setLocalPosition] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [callDuration, setCallDuration] = useState(0);

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Attach remote stream to video element (for video calls)
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Call duration timer
  useEffect(() => {
    if (callState === CALL_STATES.CONNECTED) {
      const interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [callState]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Draggable local video preview
  const handleDragStart = (e) => {
    e.preventDefault();
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    setDragOffset({
      x: clientX - localPosition.x,
      y: clientY - localPosition.y
    });
    setIsDragging(true);
  };

  const handleDragMove = (e) => {
    if (!isDragging) return;
    const clientX = e.clientX || e.touches?.[0]?.clientX;
    const clientY = e.clientY || e.touches?.[0]?.clientY;
    setLocalPosition({
      x: clientX - dragOffset.x,
      y: clientY - dragOffset.y
    });
  };

  const handleDragEnd = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('touchmove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      window.addEventListener('touchend', handleDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchend', handleDragEnd);
      };
    }
  }, [isDragging, dragOffset]);

  if (!callData) return null;

  const isVideoCall = callData.callType === 'video';
  const displayName = callData.initiator ? callData.recipientName : callData.callerName;
  const avatar = callData.initiator ? callData.recipientAvatar : callData.callerAvatar;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-[#0c1118] flex flex-col"
    >
      {/* Main Content */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 to-slate-800" />

        {/* Video call - Remote video */}
        {isVideoCall && (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Voice call - Avatar */}
        {!isVideoCall && (
          <div className="relative z-10 flex flex-col items-center">
            <div className="w-40 h-40 rounded-full flex items-center justify-center overflow-hidden mb-6"
              style={{
                background: 'linear-gradient(135deg, rgba(0,240,255,0.25) 0%, rgba(0,255,102,0.12) 100%)'
              }}
            >
              {avatar ? (
                <img src={avatar} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-5xl font-bold text-white">
                  {displayName?.[0]?.toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <h2 className="text-3xl font-bold text-white mb-2">{displayName || 'Unknown'}</h2>
            <p className="text-white/60">
              {callState === CALL_STATES.CONNECTED ? formatDuration(callDuration) : 'Connecting...'}
            </p>
          </div>
        )}

        {/* Local video preview (draggable for video calls) */}
        {isVideoCall && (
          <div
            style={{
              position: 'absolute',
              top: `${localPosition.y}px`,
              left: `${localPosition.x}px`,
              width: '120px',
              height: '160px',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
              zIndex: 100,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            onMouseDown={handleDragStart}
            onTouchStart={handleDragStart}
            className="border border-white/20"
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Top bar - Call info */}
        <div className="absolute top-0 left-0 right-0 p-4 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {displayName?.[0]?.toUpperCase() || 'U'}
              </span>
            </div>
            <div>
              <p className="text-white font-medium">{displayName || 'Unknown'}</p>
              <p className="text-white/60 text-sm">
                {callState === CALL_STATES.CONNECTED ? formatDuration(callDuration) : 'Connecting...'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pb-8 z-20">
        <div className="flex items-center justify-center gap-4">
          {/* Toggle Mic */}
          <button
            onClick={onToggleMic}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isMicEnabled
                ? 'bg-white/20 hover:bg-white/30 text-white'
                : 'bg-red-500/80 hover:bg-red-600 text-white'
            }`}
            title={isMicEnabled ? 'Mute' : 'Unmute'}
          >
            {isMicEnabled ? <Mic className="w-6 h-6" /> : <MicOff className="w-6 h-6" />}
          </button>

          {/* Toggle Camera (video only) */}
          {isVideoCall && (
            <button
              onClick={onToggleCamera}
              className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                isCameraEnabled
                  ? 'bg-white/20 hover:bg-white/30 text-white'
                  : 'bg-red-500/80 hover:bg-red-600 text-white'
              }`}
              title={isCameraEnabled ? 'Turn off camera' : 'Turn on camera'}
            >
              {isCameraEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </button>
          )}

          {/* End Call */}
          <button
            onClick={onEndCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all shadow-lg shadow-red-500/30"
            title="End call"
          >
            <PhoneOff className="w-7 h-7 text-white" strokeWidth={2} />
          </button>

          {/* Toggle Speaker */}
          <button
            onClick={onToggleSpeaker}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isSpeakerEnabled
                ? 'bg-white/20 hover:bg-white/30 text-white'
                : 'bg-white/10 text-white/60'
            }`}
            title={isSpeakerEnabled ? 'Mute speaker' : 'Unmute speaker'}
          >
            {isSpeakerEnabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/**
 * CallStatusToast - Small toast for call status
 */
const CallStatusToast = ({ message, type = 'info', onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose?.();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bgColors = {
    info: 'bg-accent/20 border-accent/30',
    success: 'bg-green-500/20 border-green-500/30',
    error: 'bg-red-500/20 border-red-500/30'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`fixed top-20 left-1/2 -translate-x-1/2 px-4 py-3 rounded-full ${bgColors[type]} border backdrop-blur-md shadow-lg z-50`}
    >
      <p className="text-white text-sm font-medium">{message}</p>
    </motion.div>
  );
};

export { IncomingCallModal, OutgoingCallModal, ActiveCallUI, CallStatusToast };
