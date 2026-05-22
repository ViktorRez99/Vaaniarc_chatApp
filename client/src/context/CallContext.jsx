/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from './AuthContext';
import socketService from '../services/socket';
import voiceCallManager, { CALL_STATES } from '../services/voiceCallManager';
import { ActiveCallUI, IncomingCallModal, OutgoingCallModal } from '../components/CallUI';
import { toast } from '../components/ui/Toaster';

const CallContext = createContext({
  callState: { state: CALL_STATES.IDLE, call: null, isInitiator: false },
  isInCall: false,
  isStartingCall: false,
  startPrivateCall: async () => null,
  endCall: () => null
});

const resetCallState = {
  state: CALL_STATES.IDLE,
  call: null,
  isInitiator: false
};

export const CallProvider = ({ children }) => {
  const { user, isAuthenticated } = useAuth();
  const [callState, setCallState] = useState(resetCallState);
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isSpeakerEnabled, setIsSpeakerEnabled] = useState(true);
  const [isStartingCall, setIsStartingCall] = useState(false);
  const [, setStreamVersion] = useState(0);

  const applyManagerState = useCallback(() => {
    const snapshot = voiceCallManager.getState();
    setCallState({
      state: snapshot.state,
      call: snapshot.call,
      isInitiator: snapshot.isInitiator
    });
    setIsStartingCall(Boolean(snapshot.isStartingCall));
    setStreamVersion((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      voiceCallManager.destroy();
      setIncomingCall(null);
      setOutgoingCall(null);
      setCallState(resetCallState);
      setIsStartingCall(false);
      return undefined;
    }

    voiceCallManager.initialize(socketService);

    const unsubs = [
      voiceCallManager.on('incoming', (call) => {
        setOutgoingCall(null);
        setIncomingCall(call);
        applyManagerState();
      }),
      voiceCallManager.on('calling', (call) => {
        setIncomingCall(null);
        setOutgoingCall(call);
        applyManagerState();
      }),
      voiceCallManager.on('accepted', () => {
        setIncomingCall(null);
        setOutgoingCall(null);
        applyManagerState();
      }),
      voiceCallManager.on('connected', applyManagerState),
      voiceCallManager.on('remote_track', applyManagerState),
      voiceCallManager.on('state_changed', applyManagerState),
      voiceCallManager.on('ended', () => {
        setIncomingCall(null);
        setOutgoingCall(null);
        applyManagerState();
      }),
      voiceCallManager.on('idle', () => {
        setIncomingCall(null);
        setOutgoingCall(null);
        setCallState(resetCallState);
        setIsStartingCall(false);
        setIsMicEnabled(true);
        setIsCameraEnabled(true);
        setIsSpeakerEnabled(true);
      }),
      voiceCallManager.on('start_loading_changed', ({ isStartingCall: nextValue }) => {
        setIsStartingCall(Boolean(nextValue));
      }),
      voiceCallManager.on('rejected', (call) => {
        setIncomingCall(null);
        setOutgoingCall(null);
        applyManagerState();
        if (call?.initiator !== false) {
          toast({
            title: 'Call rejected',
            description: 'The call was rejected.',
            variant: 'error'
          });
        }
      }),
      voiceCallManager.on('missed', () => {
        setIncomingCall(null);
        setOutgoingCall(null);
        applyManagerState();
        toast({
          title: 'Missed call',
          description: 'The call was not answered.',
          variant: 'error'
        });
      }),
      voiceCallManager.on('busy', () => {
        setIncomingCall(null);
        setOutgoingCall(null);
        applyManagerState();
        toast({
          title: 'User busy',
          description: 'The user is currently on another call.',
          variant: 'error'
        });
      }),
      voiceCallManager.on('failed', ({ error }) => {
        setIncomingCall(null);
        setOutgoingCall(null);
        applyManagerState();
        toast({
          title: 'Call failed',
          description: error || 'The call could not be established.',
          variant: 'error'
        });
      }),
      voiceCallManager.on('mic_toggled', ({ enabled }) => setIsMicEnabled(enabled)),
      voiceCallManager.on('camera_toggled', ({ enabled }) => setIsCameraEnabled(enabled)),
      voiceCallManager.on('speaker_toggled', ({ enabled }) => setIsSpeakerEnabled(enabled))
    ];

    applyManagerState();

    return () => {
      unsubs.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [applyManagerState, isAuthenticated]);

  const startPrivateCall = useCallback(async (conversationId, recipient, callType = 'audio') => {
    if (!isAuthenticated) {
      throw new Error('You must be signed in to start a call.');
    }

    const managerState = voiceCallManager.getState();
    if (managerState.isStartingCall || managerState.state !== CALL_STATES.IDLE) {
      throw new Error('A call is already in progress.');
    }

    return voiceCallManager.startCall(conversationId, recipient, callType, user);
  }, [isAuthenticated, user]);

  const acceptIncomingCall = useCallback(async () => {
    if (!incomingCall) {
      return;
    }
    await voiceCallManager.acceptCall(incomingCall);
    setIncomingCall(null);
    applyManagerState();
  }, [applyManagerState, incomingCall]);

  const rejectIncomingCall = useCallback(() => {
    if (!incomingCall) {
      return;
    }
    voiceCallManager.rejectCall(incomingCall);
    setIncomingCall(null);
    applyManagerState();
  }, [applyManagerState, incomingCall]);

  const cancelOutgoingCall = useCallback(() => {
    voiceCallManager.endCall('user_cancelled');
    setOutgoingCall(null);
    applyManagerState();
  }, [applyManagerState]);

  const endCall = useCallback(() => {
    voiceCallManager.endCall('user_ended');
    applyManagerState();
  }, [applyManagerState]);

  const toggleMic = useCallback(() => {
    const enabled = !isMicEnabled;
    setIsMicEnabled(enabled);
    voiceCallManager.toggleMic(enabled);
  }, [isMicEnabled]);

  const toggleCamera = useCallback(() => {
    const enabled = !isCameraEnabled;
    setIsCameraEnabled(enabled);
    voiceCallManager.toggleCamera(enabled);
  }, [isCameraEnabled]);

  const toggleSpeaker = useCallback(() => {
    const enabled = !isSpeakerEnabled;
    setIsSpeakerEnabled(enabled);
    voiceCallManager.setSpeakerEnabled(enabled);
  }, [isSpeakerEnabled]);

  const contextValue = useMemo(() => ({
    callState,
    isInCall: callState.state !== CALL_STATES.IDLE,
    isStartingCall,
    startPrivateCall,
    endCall
  }), [callState, endCall, isStartingCall, startPrivateCall]);

  const activeCallVisible = callState.state === CALL_STATES.ACCEPTED
    || callState.state === CALL_STATES.CONNECTED;

  return (
    <CallContext.Provider value={contextValue}>
      {children}
      <AnimatePresence>
        {incomingCall && (
          <IncomingCallModal
            key={`incoming-${incomingCall.callId}`}
            callData={incomingCall}
            onAccept={acceptIncomingCall}
            onReject={rejectIncomingCall}
          />
        )}
        {outgoingCall && (
          <OutgoingCallModal
            key={`outgoing-${outgoingCall.callId}`}
            callData={outgoingCall}
            onCancel={cancelOutgoingCall}
          />
        )}
        {activeCallVisible && callState.call && (
          <ActiveCallUI
            key={`active-${callState.call.callId}`}
            callState={callState.state}
            callData={callState.call}
            localStream={voiceCallManager.localStream}
            remoteStream={voiceCallManager.remoteStream}
            isMicEnabled={isMicEnabled}
            isCameraEnabled={isCameraEnabled}
            isSpeakerEnabled={isSpeakerEnabled}
            onToggleMic={toggleMic}
            onToggleCamera={toggleCamera}
            onToggleSpeaker={toggleSpeaker}
            onEndCall={endCall}
          />
        )}
      </AnimatePresence>
    </CallContext.Provider>
  );
};

export const useCall = () => useContext(CallContext);
