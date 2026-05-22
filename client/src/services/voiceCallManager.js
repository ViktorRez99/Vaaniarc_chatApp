/*
 * Copyright (c) 2026 Abhra and VaaniArc TEAM
 * All Rights Reserved.
 * This file is part of VaaniArc and cannot be copied and/or distributed without the express permission of the owner.
 */

const CALL_STATES = {
  IDLE: 'idle',
  CALLING: 'calling',
  RINGING: 'ringing',
  ACCEPTED: 'accepted',
  CONNECTED: 'connected',
  ENDED: 'ended',
  REJECTED: 'rejected',
  MISSED: 'missed',
  FAILED: 'failed'
};

const CALL_TIMEOUT_MS = 30000;

const CALL_STORAGE_KEYS = ['activePrivateCall', 'currentPrivateCall', 'privateCallId'];

const normalizeCallId = (value) => (value == null ? null : String(value));

const createRtcSessionDescription = (description, fallbackType) => {
  if (!description) {
    return null;
  }

  if (typeof description === 'string') {
    return new RTCSessionDescription({ type: fallbackType, sdp: description });
  }

  return new RTCSessionDescription(description);
};

class VoiceCallManager {
  constructor() {
    this.state = CALL_STATES.IDLE;
    this.currentCall = null;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
    this.socketService = null;
    this.socketListeners = new Map();
    this.eventListeners = new Map();
    this.callTimeout = null;
    this.startingCall = false;
    this.ringbackAudio = null;
    this.ringtoneAudio = null;
    this.ringbackTimeout = null;
    this.ringtoneTimeout = null;
    this.pendingIceCandidates = [];
    this.isInitiator = false;
    this.hasRemoteStream = false;
    this.remoteAudioElement = null;
  }

  initialize(socketService) {
    if (!socketService) {
      return;
    }

    if (this.socketService === socketService && this.socketListeners.size > 0) {
      return;
    }

    this.removeSocketListeners();
    this.socketService = socketService;
    this.setupSocketListeners();
  }

  setupSocketListeners() {
    if (!this.socketService) {
      return;
    }

    const handlers = {
      'incoming-call': this.handleIncomingCall,
      'private-call-accepted': this.handleCallAccepted,
      'private-call-rejected': this.handleCallRejected,
      'private-call-ended': this.handleCallEnded,
      'private-call-missed': this.handleCallMissed,
      'private-call-busy': this.handleCallBusy,
      'call-accepted': this.handleCallAccepted,
      'call-rejected': this.handleCallRejected,
      'call-ended': this.handleCallEnded,
      'call-missed': this.handleCallMissed,
      'call-busy': this.handleCallBusy,
      'webrtc-offer': this.handleOffer,
      'webrtc-answer': this.handleAnswer,
      'webrtc-ice-candidate': this.handleIceCandidate,
      voice_call_incoming: this.handleIncomingCall,
      voice_call_accepted: this.handleCallAccepted,
      voice_call_rejected: this.handleCallRejected,
      voice_call_ended: this.handleCallEnded,
      voice_call_busy: this.handleCallBusy,
      voice_call_answer: this.handleAnswer,
      voice_call_ice_candidate: this.handleIceCandidate
    };

    Object.entries(handlers).forEach(([eventName, handler]) => {
      const wrappedHandler = (data) => handler.call(this, data);
      this.socketService.on(eventName, wrappedHandler);
      this.socketListeners.set(eventName, wrappedHandler);
    });
  }

  removeSocketListeners() {
    if (!this.socketService) {
      this.socketListeners.clear();
      return;
    }

    this.socketListeners.forEach((handler, eventName) => {
      this.socketService.off(eventName, handler);
    });
    this.socketListeners.clear();
  }

  async ensureSocketConnected() {
    if (!this.socketService) {
      throw new Error('Realtime service is not available.');
    }

    await this.socketService.connect({
      waitForConnection: true,
      timeoutMs: 5000
    });
  }

  async startCall(conversationId, recipient, callType = 'audio', caller = null) {
    if (this.startingCall || this.state !== CALL_STATES.IDLE) {
      throw new Error('A call is already in progress.');
    }

    if (!conversationId || !recipient?._id) {
      throw new Error('Call recipient is unavailable.');
    }

    this.startingCall = true;
    this.emit('start_loading_changed', { isStartingCall: true });

    const callId = this.generateCallId();
    const normalizedCallType = callType === 'video' ? 'video' : 'audio';

    this.isInitiator = true;
    this.pendingIceCandidates = [];
    this.currentCall = {
      callId,
      conversationId,
      chatId: conversationId,
      callerId: caller?._id || caller?.id || null,
      callerName: caller?.username || caller?.name || null,
      callerAvatar: caller?.avatar || null,
      receiverId: recipient._id,
      recipientId: recipient._id,
      recipientName: recipient.username || recipient.name || 'Contact',
      recipientAvatar: recipient.avatar || null,
      callType: normalizedCallType,
      createdAt: new Date().toISOString(),
      initiator: true
    };
    this.setState(CALL_STATES.CALLING);
    this.persistCallState();
    this.emit('calling', this.currentCall);

    try {
      await this.ensureSocketConnected();

      this.localStream = await this.getLocalMedia(normalizedCallType);
      this.peerConnection = await this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      const didEmitStart = this.emitSocket('private-call-start', {
        callId,
        conversationId,
        chatId: conversationId,
        receiverId: recipient._id,
        recipientId: recipient._id,
        callType: normalizedCallType,
        offer: this.peerConnection.localDescription
      });
      if (!didEmitStart) {
        throw new Error('Realtime service is not connected.');
      }

      this.playRingback();
      this.setCallTimeout(CALL_TIMEOUT_MS);
      this.persistCallState();

      return callId;
    } catch (error) {
      console.error('Error starting call:', error);
      this.failCall(error.message || 'The call could not be started.');
      throw error;
    } finally {
      this.startingCall = false;
      this.emit('start_loading_changed', { isStartingCall: false });
    }
  }

  async acceptCall(callData = this.currentCall) {
    if (!callData) {
      return;
    }

    if (![CALL_STATES.RINGING, CALL_STATES.IDLE].includes(this.state)) {
      this.rejectCall(callData, 'busy');
      return;
    }

    try {
      await this.ensureSocketConnected();
      this.stopRingtone();
      this.clearCallTimeout();

      const normalizedCall = this.normalizeIncomingCall(callData);
      this.isInitiator = false;
      this.currentCall = {
        ...normalizedCall,
        initiator: false
      };
      this.setState(CALL_STATES.ACCEPTED);

      this.localStream = await this.getLocalMedia(this.currentCall.callType);
      this.peerConnection = await this.createPeerConnection();
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection.addTrack(track, this.localStream);
      });

      const remoteOffer = createRtcSessionDescription(this.currentCall.offer, 'offer');
      if (!remoteOffer) {
        throw new Error('Incoming call is missing WebRTC offer data.');
      }

      await this.peerConnection.setRemoteDescription(remoteOffer);
      await this.flushPendingIceCandidates();

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      this.emitSocket('private-call-accepted', {
        callId: this.currentCall.callId,
        conversationId: this.currentCall.conversationId,
        chatId: this.currentCall.chatId,
        answer: this.peerConnection.localDescription
      });

      this.persistCallState();
      this.emit('accepted', this.currentCall);
      this.setCallTimeout(CALL_TIMEOUT_MS * 2);
    } catch (error) {
      console.error('Error accepting call:', error);
      this.emitSocket('private-call-rejected', {
        callId: callData.callId,
        conversationId: callData.conversationId || callData.chatId,
        chatId: callData.chatId || callData.conversationId,
        reason: 'connection_error'
      });
      this.failCall(error.message || 'The call could not be accepted.');
    }
  }

  rejectCall(callData = this.currentCall, reason = 'user_rejected') {
    if (!callData) {
      return;
    }

    this.stopRingtone();
    this.clearCallTimeout();

    this.emitSocket('private-call-rejected', {
      callId: callData.callId,
      conversationId: callData.conversationId || callData.chatId,
      chatId: callData.chatId || callData.conversationId,
      reason
    });

    this.currentCall = callData;
    this.setState(reason === 'busy' ? CALL_STATES.FAILED : CALL_STATES.REJECTED);
    this.emit(reason === 'busy' ? 'busy' : 'rejected', { ...callData, reason });
    this.cleanup();
    this.resetSoon(1500);
  }

  endCall(reason = 'user_ended', options = {}) {
    const { notifyPeer = true } = options;

    if (this.state === CALL_STATES.IDLE && !this.currentCall) {
      this.cleanup();
      return;
    }

    const call = this.currentCall;

    this.stopRingback();
    this.stopRingtone();
    this.clearCallTimeout();

    if (notifyPeer && call) {
      this.emitSocket('private-call-ended', {
        callId: call.callId,
        conversationId: call.conversationId || call.chatId,
        chatId: call.chatId || call.conversationId,
        reason
      });
    }

    this.setState(CALL_STATES.ENDED);
    this.emit('ended', { ...call, reason });
    this.cleanup();
    this.resetSoon(1000);
  }

  async createPeerConnection() {
    const peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    peerConnection.onicecandidate = (event) => {
      if (!event.candidate || !this.currentCall) {
        return;
      }

      this.emitSocket('webrtc-ice-candidate', {
        callId: this.currentCall.callId,
        conversationId: this.currentCall.conversationId || this.currentCall.chatId,
        chatId: this.currentCall.chatId || this.currentCall.conversationId,
        candidate: event.candidate
      });
    };

    peerConnection.onconnectionstatechange = () => {
      if (peerConnection.connectionState === 'connected') {
        this.clearCallTimeout();
        this.setState(CALL_STATES.CONNECTED);
        this.emit('connected', this.currentCall);
        return;
      }

      if (['failed', 'disconnected', 'closed'].includes(peerConnection.connectionState)) {
        if ([CALL_STATES.ACCEPTED, CALL_STATES.CONNECTED].includes(this.state)) {
          this.endCall('connection_failed');
        }
      }
    };

    peerConnection.ontrack = (event) => {
      this.hasRemoteStream = true;
      const [stream] = event.streams || [];

      if (stream) {
        this.remoteStream = stream;
      } else {
        if (!this.remoteStream) {
          this.remoteStream = new MediaStream();
        }
        this.remoteStream.addTrack(event.track);
      }

      this.attachRemoteAudio();
      this.emit('remote_track', {
        call: this.currentCall,
        stream: this.remoteStream,
        track: event.track
      });
    };

    return peerConnection;
  }

  async handleIncomingCall(data) {
    const incomingCall = this.normalizeIncomingCall(data);
    const currentCallId = normalizeCallId(this.currentCall?.callId);

    if (!incomingCall.callId) {
      return;
    }

    if (currentCallId === normalizeCallId(incomingCall.callId)) {
      return;
    }

    if (this.state !== CALL_STATES.IDLE) {
      this.emitSocket('private-call-rejected', {
        callId: incomingCall.callId,
        conversationId: incomingCall.conversationId,
        chatId: incomingCall.chatId,
        reason: 'busy'
      });
      this.emit('busy', incomingCall);
      return;
    }

    this.isInitiator = false;
    this.currentCall = {
      ...incomingCall,
      initiator: false
    };
    this.pendingIceCandidates = [];
    this.setState(CALL_STATES.RINGING);
    this.playRingtone();
    this.setCallTimeout(CALL_TIMEOUT_MS);
    this.persistCallState();
    this.emit('incoming', this.currentCall);
  }

  async handleOffer(data) {
    if (!this.currentCall || normalizeCallId(data.callId) !== normalizeCallId(this.currentCall.callId)) {
      return;
    }

    this.currentCall = {
      ...this.currentCall,
      offer: data.offer
    };
    this.emit('state_changed', {
      oldState: this.state,
      newState: this.state,
      call: this.currentCall
    });
  }

  async handleAnswer(data) {
    if (!this.peerConnection || normalizeCallId(data.callId) !== normalizeCallId(this.currentCall?.callId)) {
      return;
    }

    try {
      const answer = createRtcSessionDescription(data.answer, 'answer');
      if (!answer) {
        return;
      }

      if (!this.peerConnection.currentRemoteDescription) {
        await this.peerConnection.setRemoteDescription(answer);
      }
      await this.flushPendingIceCandidates();
    } catch (error) {
      console.error('Error setting call answer:', error);
      this.endCall('connection_error');
    }
  }

  async handleIceCandidate(data) {
    if (!data?.candidate || normalizeCallId(data.callId) !== normalizeCallId(this.currentCall?.callId)) {
      return;
    }

    const candidate = new RTCIceCandidate(data.candidate);

    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(candidate);
    } catch (error) {
      console.warn('Error adding call ICE candidate:', error);
    }
  }

  handleCallAccepted(data) {
    if (normalizeCallId(data.callId) !== normalizeCallId(this.currentCall?.callId)) {
      return;
    }

    this.stopRingback();
    this.clearCallTimeout();

    if (this.state === CALL_STATES.CALLING) {
      this.setState(CALL_STATES.ACCEPTED);
    }

    this.emit('accepted', this.currentCall);
  }

  handleCallRejected(data) {
    if (normalizeCallId(data.callId) !== normalizeCallId(this.currentCall?.callId)) {
      return;
    }

    const reason = data.reason || 'user_rejected';

    this.stopRingback();
    this.stopRingtone();
    this.clearCallTimeout();
    this.setState(reason === 'busy' ? CALL_STATES.FAILED : CALL_STATES.REJECTED);
    this.emit(reason === 'busy' ? 'busy' : 'rejected', { ...this.currentCall, reason });
    this.cleanup();
    this.resetSoon(2000);
  }

  handleCallEnded(data) {
    const eventCallId = normalizeCallId(data.callId);
    const activeCallId = normalizeCallId(this.currentCall?.callId);

    if (eventCallId && activeCallId && eventCallId !== activeCallId) {
      return;
    }

    if ([CALL_STATES.ENDED, CALL_STATES.REJECTED, CALL_STATES.MISSED, CALL_STATES.FAILED].includes(this.state)) {
      this.cleanup();
      return;
    }

    this.endCall(data.reason || 'remote_ended', { notifyPeer: false });
  }

  handleCallMissed(data) {
    if (normalizeCallId(data.callId) !== normalizeCallId(this.currentCall?.callId)) {
      return;
    }

    this.stopRingback();
    this.stopRingtone();
    this.clearCallTimeout();
    this.setState(CALL_STATES.MISSED);
    this.emit('missed', { ...this.currentCall, reason: data.reason || 'timeout' });
    this.cleanup();
    this.resetSoon(2000);
  }

  handleCallBusy(data) {
    if (normalizeCallId(data.callId) !== normalizeCallId(this.currentCall?.callId)) {
      return;
    }

    this.stopRingback();
    this.clearCallTimeout();
    this.setState(CALL_STATES.FAILED);
    this.emit('busy', this.currentCall);
    this.cleanup();
    this.resetSoon(2000);
  }

  async getLocalMedia(callType) {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot access microphone or camera devices.');
    }

    const constraints = callType === 'video'
      ? { audio: true, video: true }
      : { audio: true, video: false };

    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async flushPendingIceCandidates() {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      return;
    }

    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      try {
        await this.peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.warn('Error adding queued call ICE candidate:', error);
      }
    }
  }

  attachRemoteAudio() {
    if (!this.remoteStream) {
      return;
    }

    if (!this.remoteAudioElement) {
      this.remoteAudioElement = document.createElement('audio');
      this.remoteAudioElement.autoplay = true;
      this.remoteAudioElement.playsInline = true;
    }

    this.remoteAudioElement.srcObject = this.remoteStream;
    this.remoteAudioElement.play().catch((error) => {
      console.warn('Could not autoplay remote call audio:', error);
    });
  }

  setCallTimeout(duration = CALL_TIMEOUT_MS) {
    this.clearCallTimeout();
    this.callTimeout = window.setTimeout(() => {
      if ([CALL_STATES.CALLING, CALL_STATES.RINGING].includes(this.state) && this.currentCall) {
        const call = this.currentCall;
        this.emitSocket('private-call-missed', {
          callId: call.callId,
          conversationId: call.conversationId || call.chatId,
          chatId: call.chatId || call.conversationId,
          reason: 'timeout'
        });
        this.handleCallMissed({ callId: call.callId, reason: 'timeout' });
      }
    }, duration);
  }

  clearCallTimeout() {
    if (this.callTimeout) {
      window.clearTimeout(this.callTimeout);
      this.callTimeout = null;
    }
  }

  playRingback() {
    this.stopRingback();

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.ringbackAudio = audioContext;

      const playTone = () => {
        if (!this.ringbackAudio || ![CALL_STATES.CALLING, CALL_STATES.ACCEPTED].includes(this.state)) {
          return;
        }

        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(480, audioContext.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioContext.currentTime);
        gain.gain.setValueAtTime(0, audioContext.currentTime + 0.5);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.5);
        this.ringbackTimeout = window.setTimeout(playTone, 1500);
      };

      playTone();
    } catch (error) {
      console.warn('Could not play call ringback:', error);
    }
  }

  stopRingback() {
    if (this.ringbackTimeout) {
      window.clearTimeout(this.ringbackTimeout);
      this.ringbackTimeout = null;
    }

    if (this.ringbackAudio) {
      try {
        this.ringbackAudio.close()?.catch?.(() => {});
      } catch (error) {
        // AudioContext may already be closed.
      }
      this.ringbackAudio = null;
    }
  }

  playRingtone() {
    this.stopRingtone();

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.ringtoneAudio = audioContext;

      const playTone = () => {
        if (!this.ringtoneAudio || this.state !== CALL_STATES.RINGING) {
          return;
        }

        [0, 0.6].forEach((delay) => {
          const oscillator = audioContext.createOscillator();
          const gain = audioContext.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(600, audioContext.currentTime + delay);
          gain.gain.setValueAtTime(0, audioContext.currentTime + delay);
          gain.gain.linearRampToValueAtTime(0.15, audioContext.currentTime + delay + 0.05);
          gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + delay + 0.5);
          oscillator.connect(gain);
          gain.connect(audioContext.destination);
          oscillator.start(audioContext.currentTime + delay);
          oscillator.stop(audioContext.currentTime + delay + 0.5);
        });

        this.ringtoneTimeout = window.setTimeout(playTone, 3000);
      };

      playTone();
    } catch (error) {
      console.warn('Could not play call ringtone:', error);
    }
  }

  stopRingtone() {
    if (this.ringtoneTimeout) {
      window.clearTimeout(this.ringtoneTimeout);
      this.ringtoneTimeout = null;
    }

    if (this.ringtoneAudio) {
      try {
        this.ringtoneAudio.close()?.catch?.(() => {});
      } catch (error) {
        // AudioContext may already be closed.
      }
      this.ringtoneAudio = null;
    }
  }

  toggleMic(enabled) {
    if (!this.localStream) {
      return;
    }

    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    this.emit('mic_toggled', { enabled });
  }

  toggleCamera(enabled) {
    if (!this.localStream) {
      return;
    }

    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = enabled;
    });
    this.emit('camera_toggled', { enabled });
  }

  setSpeakerEnabled(enabled) {
    if (this.remoteAudioElement) {
      this.remoteAudioElement.muted = !enabled;
    }
    this.emit('speaker_toggled', { enabled });
  }

  emitSocket(eventName, payload) {
    if (!this.socketService) {
      return false;
    }

    return this.socketService.emit(eventName, payload);
  }

  normalizeIncomingCall(data = {}) {
    const conversationId = data.conversationId || data.chatId;
    return {
      ...data,
      callId: data.callId,
      conversationId,
      chatId: data.chatId || conversationId,
      callerId: data.callerId,
      receiverId: data.receiverId || data.recipientId,
      recipientId: data.recipientId || data.receiverId,
      callerName: data.callerName || data.from?.username || 'Contact',
      callerAvatar: data.callerAvatar || data.from?.avatar || null,
      callType: data.callType === 'video' ? 'video' : 'audio',
      createdAt: data.createdAt || new Date().toISOString()
    };
  }

  failCall(error) {
    this.stopRingback();
    this.stopRingtone();
    this.clearCallTimeout();
    this.setState(CALL_STATES.FAILED);
    this.emit('failed', { call: this.currentCall, error });
    this.cleanup();
    this.resetSoon(2000);
  }

  setState(newState) {
    const oldState = this.state;
    this.state = newState;
    this.emit('state_changed', { oldState, newState, call: this.currentCall });
  }

  resetSoon(delay) {
    window.setTimeout(() => this.resetState(), delay);
  }

  resetState() {
    this.state = CALL_STATES.IDLE;
    this.currentCall = null;
    this.pendingIceCandidates = [];
    this.startingCall = false;
    this.isInitiator = false;
    this.hasRemoteStream = false;
    this.clearStoredCallState();
    this.emit('idle');
  }

  cleanup() {
    this.stopRingback();
    this.stopRingtone();
    this.clearCallTimeout();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.pause();
      this.remoteAudioElement.currentTime = 0;
      this.remoteAudioElement.srcObject = null;
      this.remoteAudioElement.remove?.();
      this.remoteAudioElement = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
    }

    if (this.peerConnection) {
      this.peerConnection.onicecandidate = null;
      this.peerConnection.ontrack = null;
      this.peerConnection.onconnectionstatechange = null;
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.remoteStream = null;
    this.pendingIceCandidates = [];
    this.hasRemoteStream = false;
    this.clearStoredCallState();
  }

  persistCallState() {
    if (typeof window === 'undefined' || !this.currentCall) {
      return;
    }

    window.sessionStorage?.setItem('currentPrivateCall', JSON.stringify({
      callId: this.currentCall.callId,
      conversationId: this.currentCall.conversationId || this.currentCall.chatId,
      callType: this.currentCall.callType,
      state: this.state
    }));
  }

  clearStoredCallState() {
    if (typeof window === 'undefined') {
      return;
    }

    CALL_STORAGE_KEYS.forEach((key) => {
      window.localStorage?.removeItem(key);
      window.sessionStorage?.removeItem(key);
    });
  }

  getState() {
    return {
      state: this.state,
      call: this.currentCall,
      isStartingCall: this.startingCall,
      isInitiator: this.isInitiator,
      hasRemoteStream: this.hasRemoteStream,
      localStream: this.localStream,
      remoteStream: this.remoteStream
    };
  }

  generateCallId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `call_${crypto.randomUUID()}`;
    }

    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, new Set());
    }

    this.eventListeners.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    this.eventListeners.get(eventName)?.delete(callback);
  }

  emit(eventName, data) {
    this.eventListeners.get(eventName)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Call listener failed for ${eventName}:`, error);
      }
    });
  }

  destroy() {
    if (this.state !== CALL_STATES.IDLE) {
      this.endCall('destroyed');
    }
    this.removeSocketListeners();
    this.stopRingback();
    this.stopRingtone();
    this.clearCallTimeout();
    this.cleanup();
    this.eventListeners.clear();
    this.socketService = null;
  }
}

export { VoiceCallManager, CALL_STATES };
export default new VoiceCallManager();
