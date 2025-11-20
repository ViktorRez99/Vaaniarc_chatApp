import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import {
  Video, VideoOff, Mic, MicOff, Monitor, MonitorOff,
  Users, Copy, Check, Phone, Settings, Grid, Maximize2,
  MessageSquare, MoreVertical, LogOut, Plus, Calendar, Clock
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import socketService from '../services/socket';
import api from '../services/api';

const MeetingsPage = forwardRef((props, ref) => {
  const { user } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [activeMeeting, setActiveMeeting] = useState(null);
  const [isInMeeting, setIsInMeeting] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState('');
  const [joinMeetingId, setJoinMeetingId] = useState('');
  const [isCreatingMeeting, setIsCreatingMeeting] = useState(false);
  
  // Meeting controls state
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Refs for media streams
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    startInstantMeeting
  }));

  useEffect(() => {
    if (user) {
      fetchMeetings();
    }
  }, [user]);

  useEffect(() => {
    if (isInMeeting && activeMeeting) {
      setupSocketListeners();
      initializeMedia();
    }

    return () => {
      cleanupMedia();
      cleanupSocketListeners();
    };
  }, [isInMeeting, activeMeeting]);

  const fetchMeetings = async () => {
    if (!user) return;
    
    try {
      const response = await api.get('/meetings');
      setMeetings(response.data);
    } catch (error) {
      console.error('Error fetching meetings:', error);
    }
  };

  const createMeeting = async (isInstant = false) => {
    if (isCreatingMeeting) return;
    
    try {
      setIsCreatingMeeting(true);
      const title = isInstant ? `Instant Meeting - ${new Date().toLocaleTimeString()}` : (meetingTitle || 'New Meeting');
      
      const response = await api.post('/meetings', {
        title,
        scheduledAt: null
      });
      
      const meeting = response.data || response;
      setActiveMeeting(meeting);
      setShowCreateModal(false);
      setMeetingTitle('');
      await joinMeeting(meeting.meetingId);
    } catch (error) {
      console.error('Error creating meeting:', error);
      alert('Failed to create meeting. Please try again.');
    } finally {
      setIsCreatingMeeting(false);
    }
  };

  const startInstantMeeting = async () => {
    await createMeeting(true);
  };

  const joinMeetingByLink = async () => {
    if (!joinMeetingId.trim()) {
      alert('Please enter a meeting ID');
      return;
    }

    try {
      await joinMeeting(joinMeetingId.trim());
      setShowJoinModal(false);
      setJoinMeetingId('');
    } catch (error) {
      console.error('Error joining meeting:', error);
      alert('Failed to join meeting. Please check the meeting ID and try again.');
    }
  };

  const joinMeeting = async (meetingId) => {
    try {
      const response = await api.post(`/meetings/${meetingId}/join`);
      const meeting = response.data || response;
      setActiveMeeting(meeting);
      setIsInMeeting(true);
      
      // Emit socket event
      socketService.emit('join_meeting', { meetingId });
    } catch (error) {
      console.error('Error joining meeting:', error);
    }
  };

  const leaveMeeting = async () => {
    if (!activeMeeting) return;

    try {
      await api.post(`/meetings/${activeMeeting.meetingId}/leave`);
      socketService.emit('leave_meeting', { meetingId: activeMeeting.meetingId });
      
      cleanupMedia();
      setIsInMeeting(false);
      setActiveMeeting(null);
      fetchMeetings();
    } catch (error) {
      console.error('Error leaving meeting:', error);
    }
  };

  const endMeeting = async () => {
    if (!activeMeeting) return;

    try {
      await api.post(`/meetings/${activeMeeting.meetingId}/end`);
      cleanupMedia();
      setIsInMeeting(false);
      setActiveMeeting(null);
      fetchMeetings();
    } catch (error) {
      console.error('Error ending meeting:', error);
    }
  };

  const initializeMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      });

      localStreamRef.current = stream;
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Initialize WebRTC peer connections for other participants
      // This is a simplified version - full WebRTC implementation would be more complex
    } catch (error) {
      console.error('Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
    }
  };

  const cleanupMedia = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }

    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
      screenStreamRef.current = null;
    }

    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
  };

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
        
        socketService.emit('toggle_audio', {
          meetingId: activeMeeting.meetingId,
          enabled: audioTrack.enabled
        });
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        
        socketService.emit('toggle_video', {
          meetingId: activeMeeting.meetingId,
          enabled: videoTrack.enabled
        });
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        // Stop screen sharing
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach(track => track.stop());
          screenStreamRef.current = null;
        }
        
        // Re-enable camera
        if (localVideoRef.current && localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        
        setIsScreenSharing(false);
        socketService.emit('screen_share', {
          meetingId: activeMeeting.meetingId,
          enabled: false
        });
      } else {
        // Start screen sharing
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false
        });
        
        screenStreamRef.current = screenStream;
        
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }
        
        // Handle when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
        
        setIsScreenSharing(true);
        socketService.emit('screen_share', {
          meetingId: activeMeeting.meetingId,
          enabled: true
        });
      }
    } catch (error) {
      console.error('Error toggling screen share:', error);
    }
  };

  const copyMeetingLink = () => {
    const link = `${window.location.origin}/meeting/${activeMeeting.meetingId}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const setupSocketListeners = () => {
    socketService.on('user_joined_meeting', handleUserJoined);
    socketService.on('user_left_meeting', handleUserLeft);
    socketService.on('user_toggle_audio', handleRemoteAudioToggle);
    socketService.on('user_toggle_video', handleRemoteVideoToggle);
  };

  const cleanupSocketListeners = () => {
    socketService.off('user_joined_meeting', handleUserJoined);
    socketService.off('user_left_meeting', handleUserLeft);
    socketService.off('user_toggle_audio', handleRemoteAudioToggle);
    socketService.off('user_toggle_video', handleRemoteVideoToggle);
  };

  const handleUserJoined = (data) => {
    console.log('User joined:', data);
    // In a full implementation, this would trigger WebRTC peer connection setup
  };

  const handleUserLeft = (data) => {
    console.log('User left:', data);
    // Clean up peer connection
  };

  const handleRemoteAudioToggle = (data) => {
    console.log('Remote audio toggled:', data);
  };

  const handleRemoteVideoToggle = (data) => {
    console.log('Remote video toggled:', data);
  };

  const formatDateTime = (date) => {
    return new Date(date).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

    if (isInMeeting && activeMeeting) {
    return (
      <div className="h-[calc(100vh-4rem)] bg-transparent flex flex-col relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 blur-[120px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/10 blur-[120px]"></div>
        </div>

        {/* Meeting Header - Floating */}
        <div className="absolute top-6 left-6 right-6 z-50 flex items-center justify-between pointer-events-none">
          <div className="pointer-events-auto flex items-center space-x-4 px-6 py-3 bg-slate-900/40 backdrop-blur-2xl border border-white/10 rounded-full shadow-lg">
            <h2 className="text-sm font-semibold text-white">{activeMeeting.title}</h2>
            <div className="w-px h-4 bg-white/10"></div>
            <div className="flex items-center space-x-2">
              <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-red-400 font-medium tracking-wide uppercase">Live</span>
            </div>
          </div>
          
          <div className="pointer-events-auto flex items-center space-x-3">
            <button
              onClick={copyMeetingLink}
              className="flex items-center space-x-2 px-5 py-3 bg-slate-900/40 hover:bg-white/10 border border-white/10 rounded-full backdrop-blur-2xl transition-all group shadow-lg"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400 font-medium">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 text-slate-300 group-hover:text-white" />
                  <span className="text-sm text-slate-300 group-hover:text-white font-medium">Copy Link</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className={`p-3 rounded-full border border-white/10 backdrop-blur-2xl transition-all shadow-lg ${
                showParticipants ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-slate-900/40 hover:bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Grid - Google Meet Style */}
        <div className="flex-1 p-6 pt-24 pb-28 overflow-auto relative flex items-center justify-center">
          {/* Other participants' videos - main grid */}
          {activeMeeting.participants && activeMeeting.participants.filter(p => p.user && String(p.user._id) !== String(user?._id) && !p.leftAt).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-7xl h-full max-h-full content-center">
              {activeMeeting.participants
                .filter(p => p.user && String(p.user._id) !== String(user?._id) && !p.leftAt)
                .map((participant) => (
                <div key={participant.user._id} className="relative bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl overflow-hidden aspect-video shadow-2xl ring-1 ring-white/5">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 rounded-full flex items-center justify-center border border-white/10 backdrop-blur-sm shadow-inner">
                      <span className="text-4xl font-bold text-white/80">{participant.user.username?.[0]?.toUpperCase() || 'U'}</span>
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-4 flex items-center space-x-2 bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full">
                    <span className="text-sm font-medium text-white">{participant.user.username || 'Unknown'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty state - just you in the meeting */
            <div className="flex items-center justify-center h-full w-full">
              <div className="text-center p-10 bg-slate-900/40 backdrop-blur-3xl border border-white/10 rounded-[2.5rem] max-w-md shadow-2xl ring-1 ring-white/5">
                <div className="w-24 h-24 mx-auto mb-8 bg-gradient-to-br from-white/5 to-white/0 rounded-full flex items-center justify-center border border-white/10 shadow-inner">
                  <Users className="w-10 h-10 text-white/40" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">You're the only one here</h3>
                <p className="text-white/50 mb-8 leading-relaxed">Share the meeting link to invite others to join this conversation.</p>
                <button 
                  onClick={copyMeetingLink}
                  className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl text-white font-medium transition-all flex items-center justify-center space-x-3 mx-auto hover:scale-105 active:scale-95"
                >
                  <Copy className="w-5 h-5" />
                  <span>Copy Meeting Link</span>
                </button>
              </div>
            </div>
          )}

          {/* Local Video Preview - Floating */}
          <div className="absolute bottom-8 right-8 w-80 aspect-video bg-slate-900/80 backdrop-blur-2xl rounded-3xl overflow-hidden shadow-2xl border border-white/20 z-10 group transition-all hover:scale-105 ring-1 ring-white/10">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800/90 backdrop-blur-sm">
                <div className="w-20 h-20 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center shadow-lg">
                  <span className="text-2xl font-bold text-white">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                </div>
              </div>
            )}
            <div className="absolute bottom-4 left-4 flex items-center space-x-2 bg-black/50 backdrop-blur-xl border border-white/10 px-3 py-1.5 rounded-full">
              <span className="text-xs font-medium text-white">You</span>
              {!isAudioEnabled && <MicOff className="w-3 h-3 text-red-400" />}
            </div>
          </div>
        </div>

        {/* Meeting Controls - Floating Island */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-50">
          <div className="px-3 py-3 bg-slate-900/60 backdrop-blur-3xl border border-white/10 rounded-full flex items-center space-x-3 shadow-2xl ring-1 ring-white/5">
            <button
              onClick={toggleAudio}
              className={`p-4 rounded-full transition-all border ${
                isAudioEnabled
                  ? 'bg-white/5 hover:bg-white/10 border-transparent text-white hover:scale-105 active:scale-95'
                  : 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-400'
              }`}
              title={isAudioEnabled ? "Mute Microphone" : "Unmute Microphone"}
            >
              {isAudioEnabled ? (
                <Mic className="w-6 h-6" />
              ) : (
                <MicOff className="w-6 h-6" />
              )}
            </button>

            <button
              onClick={toggleVideo}
              className={`p-4 rounded-full transition-all border ${
                isVideoEnabled
                  ? 'bg-white/5 hover:bg-white/10 border-transparent text-white hover:scale-105 active:scale-95'
                  : 'bg-red-500/20 hover:bg-red-500/30 border-red-500/30 text-red-400'
              }`}
              title={isVideoEnabled ? "Turn Off Camera" : "Turn On Camera"}
            >
              {isVideoEnabled ? (
                <Video className="w-6 h-6" />
              ) : (
                <VideoOff className="w-6 h-6" />
              )}
            </button>

            <button
              onClick={toggleScreenShare}
              className={`p-4 rounded-full transition-all border ${
                isScreenSharing
                  ? 'bg-indigo-500/20 hover:bg-indigo-500/30 border-indigo-500/30 text-indigo-400'
                  : 'bg-white/5 hover:bg-white/10 border-transparent text-white hover:scale-105 active:scale-95'
              }`}
              title="Share Screen"
            >
              {isScreenSharing ? (
                <MonitorOff className="w-6 h-6" />
              ) : (
                <Monitor className="w-6 h-6" />
              )}
            </button>

            <div className="w-px h-8 bg-white/10 mx-2"></div>

            <button
              onClick={leaveMeeting}
              className="px-8 py-4 bg-red-500/80 hover:bg-red-600/90 backdrop-blur-md rounded-full transition-all flex items-center space-x-2 font-medium shadow-lg shadow-red-900/20 border border-red-400/20 hover:scale-105 active:scale-95"
            >
              <Phone className="w-5 h-5 rotate-135 fill-current" />
              <span>Leave</span>
            </button>

            {activeMeeting.host === user?._id && (
              <button
                onClick={endMeeting}
                className="p-4 bg-slate-800/80 hover:bg-slate-700/80 backdrop-blur-md border border-white/10 rounded-full transition-all font-medium text-red-400 hover:text-red-300 hover:scale-105 active:scale-95"
                title="End Meeting for All"
              >
                <LogOut className="w-6 h-6" />
              </button>
            )}
          </div>
        </div>

        {/* Participants Sidebar - Floating */}
        {showParticipants && (
          <div className="fixed right-6 top-24 bottom-32 w-96 bg-slate-900/80 backdrop-blur-3xl border border-white/10 rounded-[2rem] p-6 overflow-hidden shadow-2xl z-40 flex flex-col ring-1 ring-white/5">
            <div className="flex items-center justify-between mb-6 px-2">
              <h3 className="text-lg font-semibold text-white">
                Participants <span className="text-slate-400 text-sm ml-1">({activeMeeting.participants?.filter(p => !p.leftAt).length || 0})</span>
              </h3>
              <button onClick={() => setShowParticipants(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <Users className="w-4 h-4 text-slate-400" />
              </button>
            </div>
            
            <div className="space-y-2 overflow-y-auto flex-1 pr-2 custom-scrollbar">
              {activeMeeting.participants && activeMeeting.participants
                .filter(p => !p.leftAt && p.user)
                .map((participant) => (
                <div key={participant.user._id} className="flex items-center space-x-4 p-4 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/10 rounded-full flex items-center justify-center shadow-inner">
                    <span className="text-sm font-bold text-indigo-300">{participant.user.username?.[0]?.toUpperCase() || 'U'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-slate-200 truncate">{participant.user.username || 'Unknown'}</p>
                    <p className="text-xs text-slate-500">
                      {participant.user._id === activeMeeting.host ? 'Host' : 'Participant'}
                    </p>
                  </div>
                  <div className="flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }  return (
    <div className="min-h-[calc(100vh-4rem)] p-6 relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/20 blur-[100px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-violet-500/20 blur-[100px]"></div>
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">Meetings</h1>
            <p className="text-lg text-white/60 font-light">Connect with your team instantly</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-3 px-6 py-3 bg-white/10 hover:bg-white/20 border border-white/10 rounded-full backdrop-blur-xl transition-all shadow-lg hover:shadow-indigo-500/20 group"
          >
            <div className="p-1.5 rounded-full bg-indigo-500 group-hover:bg-indigo-400 transition-colors shadow-lg shadow-indigo-500/30">
              <Plus className="w-4 h-4 text-white" />
            </div>
            <span className="font-medium text-white">New Meeting</span>
          </button>
        </div>

        {/* Quick Actions - Apple Widgets Style */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <button
            onClick={startInstantMeeting}
            disabled={isCreatingMeeting}
            className="h-64 p-8 bg-gradient-to-br from-indigo-600/90 to-violet-600/90 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] hover:shadow-2xl hover:shadow-indigo-500/30 transition-all text-left group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed flex flex-col justify-between"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center backdrop-blur-md border border-white/20 shadow-inner relative z-10 group-hover:scale-110 transition-transform duration-300">
              <Video className="w-8 h-8 text-white" />
            </div>
            
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white mb-2">
                {isCreatingMeeting ? 'Starting...' : 'Instant Meeting'}
              </h3>
              <p className="text-indigo-100/80 font-medium">Start a call right now</p>
            </div>
          </button>

          <button
            onClick={() => setShowJoinModal(true)}
            className="h-64 p-8 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] hover:bg-white/10 hover:border-white/20 transition-all text-left group relative overflow-hidden flex flex-col justify-between"
          >
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-green-500/10 rounded-full blur-2xl group-hover:bg-green-500/20 transition-colors duration-500"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner relative z-10 group-hover:scale-110 transition-transform duration-300">
              <Users className="w-8 h-8 text-green-400" />
            </div>
            
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white mb-2">Join Meeting</h3>
              <p className="text-slate-400 font-medium">Enter code or link</p>
            </div>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="h-64 p-8 bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] hover:bg-white/10 hover:border-white/20 transition-all text-left group relative overflow-hidden flex flex-col justify-between"
          >
            <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-colors duration-500"></div>
            
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center backdrop-blur-md border border-white/10 shadow-inner relative z-10 group-hover:scale-110 transition-transform duration-300">
              <Calendar className="w-8 h-8 text-blue-400" />
            </div>
            
            <div className="relative z-10">
              <h3 className="text-2xl font-bold text-white mb-2">Schedule</h3>
              <p className="text-slate-400 font-medium">Plan for later</p>
            </div>
          </button>
        </div>

        {/* Meeting History */}
        <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl ring-1 ring-white/5">
          <div className="p-8 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Recent Meetings</h2>
            <button className="px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 text-sm text-white/80 hover:text-white font-medium transition-all border border-white/5">View All</button>
          </div>
          <div className="divide-y divide-white/5">
            {(meetings || []).length === 0 ? (
              <div className="p-16 text-center">
                <div className="w-24 h-24 mx-auto mb-6 bg-gradient-to-br from-white/5 to-white/0 rounded-full flex items-center justify-center border border-white/5 shadow-inner">
                  <Video className="w-10 h-10 text-white/20" />
                </div>
                <p className="text-xl text-white/60 font-medium mb-2">No meetings yet</p>
                <p className="text-white/40">Start your first meeting to get started</p>
              </div>
            ) : (
              (meetings || []).slice(0, 10).map((meeting) => (
                <div key={meeting._id} className="p-6 hover:bg-white/5 transition-colors group">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-5">
                      <div className="w-14 h-14 bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/10 rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform shadow-inner">
                        <Video className="w-6 h-6 text-indigo-300" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-1 group-hover:text-indigo-300 transition-colors">{meeting.title}</h3>
                        <div className="flex items-center space-x-4 text-sm text-white/50">
                          <span className="flex items-center space-x-1.5">
                            <Clock className="w-4 h-4" />
                            <span>{formatDateTime(meeting.createdAt)}</span>
                          </span>
                          <span className="flex items-center space-x-1.5">
                            <Users className="w-4 h-4" />
                            <span>{meeting.participants?.length || 0} participants</span>
                          </span>
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                            meeting.status === 'active' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                            meeting.status === 'scheduled' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                            'bg-gray-500/10 text-gray-400 border-gray-500/20'
                          }`}>
                            {meeting.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    {meeting.status === 'active' && (
                      <button
                        onClick={() => joinMeeting(meeting.meetingId)}
                        className="px-6 py-2.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 rounded-xl text-indigo-300 font-medium transition-all hover:scale-105 active:scale-95"
                      >
                        Join
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create Meeting Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/80 backdrop-blur-3xl rounded-[2rem] p-8 max-w-md w-full border border-white/10 shadow-2xl ring-1 ring-white/5 transform transition-all scale-100">
            <h3 className="text-2xl font-bold mb-6 text-white">Create New Meeting</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 ml-1">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="Enter meeting title"
                  className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:bg-white/10 transition-all"
                />
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-slate-300 font-medium hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMeeting(false)}
                  disabled={isCreatingMeeting}
                  className="flex-1 px-4 py-4 bg-indigo-600 hover:bg-indigo-500 border border-indigo-500/50 rounded-2xl transition-all text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
                >
                  {isCreatingMeeting ? 'Creating...' : 'Create & Join'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Join Meeting Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900/80 backdrop-blur-3xl rounded-[2rem] p-8 max-w-md w-full border border-white/10 shadow-2xl ring-1 ring-white/5 transform transition-all scale-100">
            <h3 className="text-2xl font-bold mb-6 text-white">Join Meeting</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2 ml-1">
                  Meeting ID or Link
                </label>
                <input
                  type="text"
                  value={joinMeetingId}
                  onChange={(e) => setJoinMeetingId(e.target.value)}
                  placeholder="Enter meeting ID"
                  onKeyPress={(e) => e.key === 'Enter' && joinMeetingByLink()}
                  className="w-full px-5 py-4 bg-white/5 border border-white/10 rounded-2xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:bg-white/10 transition-all"
                />
                <p className="text-xs text-slate-400 mt-2 ml-1">
                  Paste the meeting ID from the invitation
                </p>
              </div>
              <div className="flex space-x-3 pt-2">
                <button
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinMeetingId('');
                  }}
                  className="flex-1 px-4 py-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all text-slate-300 font-medium hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={joinMeetingByLink}
                  className="flex-1 px-4 py-4 bg-green-600 hover:bg-green-500 border border-green-500/50 rounded-2xl transition-all text-white font-medium shadow-lg shadow-green-500/20"
                >
                  Join Meeting
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MeetingsPage.displayName = 'MeetingsPage';

export default MeetingsPage;
