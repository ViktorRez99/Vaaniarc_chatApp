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
      <div className="h-[calc(100vh-4rem)] bg-slate-900 flex flex-col">
        {/* Meeting Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-white/10 bg-slate-900/80 backdrop-blur-sm">
          <div className="flex items-center space-x-4">
            <h2 className="text-lg font-semibold text-white">{activeMeeting.title}</h2>
            <div className="flex items-center space-x-2 px-3 py-1 bg-red-500/20 rounded-full">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-red-400">Live</span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={copyMeetingLink}
              className="flex items-center space-x-2 px-4 py-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-400">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span className="text-sm">Copy Link</span>
                </>
              )}
            </button>
            
            <button
              onClick={() => setShowParticipants(!showParticipants)}
              className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Users className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Grid - Google Meet Style */}
        <div className="flex-1 p-4 overflow-auto relative">
          {/* Other participants' videos - main grid */}
          {activeMeeting.participants && activeMeeting.participants.filter(p => p.user && String(p.user._id) !== String(user?._id) && !p.leftAt).length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 h-full">
              {activeMeeting.participants
                .filter(p => p.user && String(p.user._id) !== String(user?._id) && !p.leftAt)
                .map((participant) => (
                <div key={participant.user._id} className="relative bg-slate-800 rounded-xl overflow-hidden aspect-video">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center">
                      <span className="text-4xl font-bold">{participant.user.username?.[0]?.toUpperCase() || 'U'}</span>
                    </div>
                  </div>
                  <div className="absolute bottom-4 left-4 flex items-center space-x-2 bg-black/70 backdrop-blur-sm px-3 py-2 rounded-lg">
                    <span className="text-sm font-medium text-white">{participant.user.username || 'Unknown'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Empty state - just you in the meeting */
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Users className="w-16 h-16 mx-auto mb-4 text-white/40" />
                <p className="text-xl text-white/60 mb-2">You're the only one here</p>
                <p className="text-white/40">Share the meeting link to invite others</p>
              </div>
            </div>
          )}

          {/* Local Video Preview - Bottom Right Corner (Google Meet Style) */}
          <div className="absolute bottom-6 right-6 w-64 h-36 bg-slate-900 rounded-xl overflow-hidden shadow-2xl border-2 border-white/10 z-10">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-800">
                <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center">
                  <span className="text-xl font-bold">{user?.username?.[0]?.toUpperCase() || 'U'}</span>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 flex items-center space-x-1 bg-black/70 backdrop-blur-sm px-2 py-1 rounded">
              <span className="text-xs font-medium text-white">You</span>
              {!isAudioEnabled && <MicOff className="w-3 h-3 text-red-400" />}
            </div>
          </div>
        </div>

        {/* Meeting Controls */}
        <div className="h-20 px-6 flex items-center justify-center space-x-3 border-t border-white/10 bg-slate-900/80 backdrop-blur-sm">
          <button
            onClick={toggleAudio}
            className={`p-4 rounded-full transition-all ${
              isAudioEnabled
                ? 'bg-slate-800 hover:bg-slate-700'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isAudioEnabled ? (
              <Mic className="w-6 h-6" />
            ) : (
              <MicOff className="w-6 h-6" />
            )}
          </button>

          <button
            onClick={toggleVideo}
            className={`p-4 rounded-full transition-all ${
              isVideoEnabled
                ? 'bg-slate-800 hover:bg-slate-700'
                : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {isVideoEnabled ? (
              <Video className="w-6 h-6" />
            ) : (
              <VideoOff className="w-6 h-6" />
            )}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-4 rounded-full transition-all ${
              isScreenSharing
                ? 'bg-indigo-600 hover:bg-indigo-700'
                : 'bg-slate-800 hover:bg-slate-700'
            }`}
          >
            {isScreenSharing ? (
              <MonitorOff className="w-6 h-6" />
            ) : (
              <Monitor className="w-6 h-6" />
            )}
          </button>

          <button
            onClick={leaveMeeting}
            className="px-6 py-4 bg-red-500 hover:bg-red-600 rounded-full transition-all flex items-center space-x-2 font-medium"
          >
            <Phone className="w-6 h-6 rotate-135" />
            <span>Leave</span>
          </button>

          {activeMeeting.host === user?._id && (
            <button
              onClick={endMeeting}
              className="px-6 py-4 bg-red-600 hover:bg-red-700 rounded-full transition-all font-medium"
            >
              End Meeting
            </button>
          )}
        </div>

        {/* Participants Sidebar */}
        {showParticipants && (
          <div className="fixed right-0 top-16 bottom-0 w-80 bg-slate-900/95 backdrop-blur-lg border-l border-white/10 p-4 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">
              Participants ({activeMeeting.participants?.filter(p => !p.leftAt).length || 0})
            </h3>
            <div className="space-y-2">
              {activeMeeting.participants && activeMeeting.participants
                .filter(p => !p.leftAt && p.user)
                .map((participant) => (
                <div key={participant.user._id} className="flex items-center space-x-3 p-3 bg-slate-800/50 rounded-lg">
                  <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-violet-500 rounded-full flex items-center justify-center">
                    <span className="text-sm font-semibold">{participant.user.username?.[0]?.toUpperCase() || 'U'}</span>
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-white">{participant.user.username || 'Unknown'}</p>
                    <p className="text-xs text-white/60">
                      {participant.user._id === activeMeeting.host ? 'Host' : 'Participant'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Meetings</h1>
            <p className="text-white/60">Start or join video meetings instantly</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl hover:shadow-lg transition-all"
          >
            <Plus className="w-5 h-5" />
            <span>New Meeting</span>
          </button>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <button
            onClick={startInstantMeeting}
            disabled={isCreatingMeeting}
            className="p-6 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl hover:shadow-lg hover:shadow-indigo-500/30 transition-all text-left group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <Video className="w-12 h-12 mb-4 group-hover:scale-110 transition-transform relative z-10" />
            <h3 className="text-xl font-bold mb-2 relative z-10">
              {isCreatingMeeting ? 'Starting...' : 'Start Instant Meeting'}
            </h3>
            <p className="text-white/80 relative z-10">Begin a meeting right now</p>
            <div className="mt-4 flex items-center space-x-2 text-sm text-white/90 relative z-10">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span>Click to start immediately</span>
            </div>
          </button>

          <button
            onClick={() => setShowJoinModal(true)}
            className="p-6 bg-slate-800/50 border border-white/10 rounded-2xl hover:bg-slate-800/70 hover:border-green-500/30 transition-all text-left group"
          >
            <Users className="w-12 h-12 mb-4 text-green-400 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold mb-2">Join Meeting</h3>
            <p className="text-white/60">Enter meeting ID or link</p>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="p-6 bg-slate-800/50 border border-white/10 rounded-2xl hover:bg-slate-800/70 hover:border-indigo-500/30 transition-all text-left group"
          >
            <Calendar className="w-12 h-12 mb-4 text-indigo-400 group-hover:scale-110 transition-transform" />
            <h3 className="text-xl font-bold mb-2">Create Meeting</h3>
            <p className="text-white/60">Customize meeting settings</p>
          </button>
        </div>

        {/* Meeting History */}
        <div className="bg-slate-800/30 rounded-2xl border border-white/10 overflow-hidden">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-xl font-bold text-white">Recent Meetings</h2>
          </div>
          <div className="divide-y divide-white/10">
            {(meetings || []).length === 0 ? (
              <div className="p-12 text-center">
                <div className="w-16 h-16 mx-auto mb-4 bg-slate-800/50 rounded-full flex items-center justify-center">
                  <Video className="w-8 h-8 text-white/40" />
                </div>
                <p className="text-white/60">No meetings yet</p>
                <p className="text-sm text-white/40 mt-2">Start your first meeting to get started</p>
              </div>
            ) : (
              (meetings || []).slice(0, 10).map((meeting) => (
                <div key={meeting._id} className="p-6 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl flex items-center justify-center">
                        <Video className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white mb-1">{meeting.title}</h3>
                        <div className="flex items-center space-x-4 text-sm text-white/60">
                          <span className="flex items-center space-x-1">
                            <Clock className="w-4 h-4" />
                            <span>{formatDateTime(meeting.createdAt)}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Users className="w-4 h-4" />
                            <span>{meeting.participants?.length || 0} participants</span>
                          </span>
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            meeting.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            meeting.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>
                            {meeting.status}
                          </span>
                        </div>
                      </div>
                    </div>
                    {meeting.status === 'active' && (
                      <button
                        onClick={() => joinMeeting(meeting.meetingId)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-white/10">
            <h3 className="text-2xl font-bold mb-6">Create New Meeting</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Meeting Title
                </label>
                <input
                  type="text"
                  value={meetingTitle}
                  onChange={(e) => setMeetingTitle(e.target.value)}
                  placeholder="Enter meeting title"
                  className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createMeeting(false)}
                  disabled={isCreatingMeeting}
                  className="flex-1 px-4 py-3 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl p-8 max-w-md w-full border border-white/10">
            <h3 className="text-2xl font-bold mb-6">Join Meeting</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Meeting ID or Link
                </label>
                <input
                  type="text"
                  value={joinMeetingId}
                  onChange={(e) => setJoinMeetingId(e.target.value)}
                  placeholder="Enter meeting ID"
                  onKeyPress={(e) => e.key === 'Enter' && joinMeetingByLink()}
                  className="w-full px-4 py-3 bg-slate-800 border border-white/10 rounded-xl text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-white/60 mt-2">
                  Paste the meeting ID from the invitation
                </p>
              </div>
              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => {
                    setShowJoinModal(false);
                    setJoinMeetingId('');
                  }}
                  className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={joinMeetingByLink}
                  className="flex-1 px-4 py-3 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl hover:shadow-lg transition-all"
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
