import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Globe,
  Lock,
  MessageCircle,
  Plus,
  Search,
  Send,
  Users,
  Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import socketService from '../services/socket';
import { idsEqual } from '../utils/identity';

const INITIAL_CHANNEL_FORM = {
  name: '',
  description: '',
  visibility: 'public',
  communityId: '',
  allowMemberPosts: false
};

const INITIAL_COMMUNITY_FORM = {
  name: '',
  description: '',
  visibility: 'public'
};

const sortByActivity = (items = [], field = 'lastActivity') => [...items].sort(
  (left, right) => new Date(right[field] || right.updatedAt || 0) - new Date(left[field] || left.updatedAt || 0)
);

const formatTime = (date) => {
  const value = new Date(date);

  if (Number.isNaN(value.getTime())) {
    return '';
  }

  return value.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  });
};

const ChannelsPage = () => {
  const { user } = useAuth();
  const [channels, setChannels] = useState([]);
  const [discoverChannels, setDiscoverChannels] = useState([]);
  const [communities, setCommunities] = useState([]);
  const [discoverCommunities, setDiscoverCommunities] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [posts, setPosts] = useState([]);
  const [postInput, setPostInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);
  const [channelForm, setChannelForm] = useState(INITIAL_CHANNEL_FORM);
  const [communityForm, setCommunityForm] = useState(INITIAL_COMMUNITY_FORM);
  const [isCreatingChannel, setIsCreatingChannel] = useState(false);
  const [isCreatingCommunity, setIsCreatingCommunity] = useState(false);
  const [joiningChannelId, setJoiningChannelId] = useState(null);
  const [joiningCommunityId, setJoiningCommunityId] = useState(null);
  const selectedChannelRef = useRef(null);
  const postsEndRef = useRef(null);

  useEffect(() => {
    selectedChannelRef.current = selectedChannel;
  }, [selectedChannel]);

  useEffect(() => {
    void loadBroadcastData();
    setupSocketListeners();

    const openChannels = () => {
      setShowCreateChannel(false);
      setShowCreateCommunity(false);
    };
    const openChannelCreator = () => {
      setShowCreateCommunity(false);
      setShowCreateChannel(true);
    };
    const openCommunityCreator = () => {
      setShowCreateChannel(false);
      setShowCreateCommunity(true);
    };

    window.addEventListener('vaaniarc:open-channels', openChannels);
    window.addEventListener('vaaniarc:open-channel-creator', openChannelCreator);
    window.addEventListener('vaaniarc:open-community-creator', openCommunityCreator);

    return () => {
      cleanupSocketListeners();
      window.removeEventListener('vaaniarc:open-channels', openChannels);
      window.removeEventListener('vaaniarc:open-channel-creator', openChannelCreator);
      window.removeEventListener('vaaniarc:open-community-creator', openCommunityCreator);
    };
  }, []);

  useEffect(() => {
    postsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts]);

  useEffect(() => {
    if (!selectedChannel?._id) {
      setPosts([]);
      return undefined;
    }

    socketService.joinChannel(selectedChannel._id);
    void loadChannelPosts(selectedChannel._id);

    return () => {
      socketService.leaveChannel(selectedChannel._id);
    };
  }, [selectedChannel?._id]);

  const filteredChannels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return channels;
    }

    return channels.filter((channel) => {
      const name = String(channel.name || '').toLowerCase();
      const description = String(channel.description || '').toLowerCase();
      const community = String(channel.community?.name || '').toLowerCase();
      return name.includes(query) || description.includes(query) || community.includes(query);
    });
  }, [channels, searchQuery]);

  const filteredDiscoverChannels = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return (discoverChannels || []).filter((channel) => {
      if (!query) {
        return true;
      }

      const name = String(channel.name || '').toLowerCase();
      const description = String(channel.description || '').toLowerCase();
      const community = String(channel.community?.name || '').toLowerCase();
      return name.includes(query) || description.includes(query) || community.includes(query);
    });
  }, [discoverChannels, searchQuery]);

  const filteredCommunities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return communities;
    }

    return communities.filter((community) => {
      const name = String(community.name || '').toLowerCase();
      const description = String(community.description || '').toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [communities, searchQuery]);

  const filteredDiscoverCommunities = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return (discoverCommunities || []).filter((community) => {
      if (!query) {
        return true;
      }

      const name = String(community.name || '').toLowerCase();
      const description = String(community.description || '').toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  }, [discoverCommunities, searchQuery]);

  const updateChannelCollections = (nextChannel) => {
    setChannels((currentChannels) => sortByActivity([
      nextChannel,
      ...currentChannels.filter((channel) => !idsEqual(channel._id, nextChannel._id))
    ]));

    setDiscoverChannels((currentChannels) => currentChannels.filter((channel) => !idsEqual(channel._id, nextChannel._id)));
  };

  const updateCommunityCollections = (nextCommunity) => {
    setCommunities((currentCommunities) => sortByActivity([
      nextCommunity,
      ...currentCommunities.filter((community) => !idsEqual(community._id, nextCommunity._id))
    ]));

    setDiscoverCommunities((currentCommunities) => currentCommunities.filter((community) => !idsEqual(community._id, nextCommunity._id)));
  };

  const loadBroadcastData = async () => {
    setIsLoading(true);
    setError('');

    try {
      const [joinedChannels, discoverableChannels, joinedCommunities, discoverableCommunities] = await Promise.all([
        api.getChannels(),
        api.getDiscoverChannels('', 12),
        api.getCommunities(),
        api.getDiscoverCommunities('', 12)
      ]);

      const nextChannels = sortByActivity(Array.isArray(joinedChannels) ? joinedChannels : []);
      setChannels(nextChannels);
      setDiscoverChannels(Array.isArray(discoverableChannels) ? discoverableChannels : []);
      setCommunities(sortByActivity(Array.isArray(joinedCommunities) ? joinedCommunities : []));
      setDiscoverCommunities(sortByActivity(Array.isArray(discoverableCommunities) ? discoverableCommunities : []));

      if (selectedChannelRef.current?._id) {
        const refreshedSelectedChannel = nextChannels.find((channel) => idsEqual(channel._id, selectedChannelRef.current._id));
        setSelectedChannel(refreshedSelectedChannel || null);
      }
    } catch (loadError) {
      console.error('Error loading channels and communities:', loadError);
      setError(loadError.message || 'Failed to load channels.');
      setChannels([]);
      setDiscoverChannels([]);
      setCommunities([]);
      setDiscoverCommunities([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadChannelPosts = async (channelId) => {
    try {
      const nextPosts = await api.getChannelPosts(channelId);
      setPosts(Array.isArray(nextPosts) ? nextPosts : []);
    } catch (loadError) {
      console.error('Error loading channel posts:', loadError);
      setError(loadError.message || 'Failed to load channel posts.');
      setPosts([]);
    }
  };

  const setupSocketListeners = () => {
    socketService.on('channel_post', handleIncomingChannelPost);
  };

  const cleanupSocketListeners = () => {
    socketService.off('channel_post', handleIncomingChannelPost);
  };

  const handleIncomingChannelPost = ({ channelId, post }) => {
    if (!channelId || !post) {
      return;
    }

    setChannels((currentChannels) => sortByActivity(currentChannels.map((channel) => (
      idsEqual(channel._id, channelId)
        ? {
            ...channel,
            lastActivity: post.createdAt || new Date().toISOString(),
            lastPost: post
          }
        : channel
    ))));

    if (!idsEqual(selectedChannelRef.current?._id, channelId)) {
      return;
    }

    setPosts((currentPosts) => {
      if (currentPosts.some((entry) => idsEqual(entry._id, post._id))) {
        return currentPosts;
      }

      return [...currentPosts, post];
    });
  };

  const handleCreateCommunity = async (event) => {
    event.preventDefault();

    if (!communityForm.name.trim()) {
      setError('Community name is required.');
      return;
    }

    setIsCreatingCommunity(true);
    setError('');

    try {
      const createdCommunity = await api.createCommunity({
        name: communityForm.name.trim(),
        description: communityForm.description.trim(),
        visibility: communityForm.visibility
      });

      updateCommunityCollections(createdCommunity);
      setCommunityForm(INITIAL_COMMUNITY_FORM);
      setShowCreateCommunity(false);
    } catch (createError) {
      console.error('Error creating community:', createError);
      setError(createError.message || 'Failed to create community.');
    } finally {
      setIsCreatingCommunity(false);
    }
  };

  const handleJoinCommunity = async (communityId) => {
    setJoiningCommunityId(communityId);
    setError('');

    try {
      const response = await api.joinCommunity(communityId);
      const joinedCommunity = response?.community || response;
      updateCommunityCollections(joinedCommunity);
    } catch (joinError) {
      console.error('Error joining community:', joinError);
      setError(joinError.message || 'Failed to join community.');
    } finally {
      setJoiningCommunityId(null);
    }
  };

  const handleCreateChannel = async (event) => {
    event.preventDefault();

    if (!channelForm.name.trim()) {
      setError('Channel name is required.');
      return;
    }

    setIsCreatingChannel(true);
    setError('');

    try {
      const createdChannel = await api.createChannel({
        name: channelForm.name.trim(),
        description: channelForm.description.trim(),
        visibility: channelForm.visibility,
        communityId: channelForm.communityId || null,
        allowMemberPosts: channelForm.allowMemberPosts
      });

      updateChannelCollections(createdChannel);
      setSelectedChannel(createdChannel);
      setChannelForm(INITIAL_CHANNEL_FORM);
      setShowCreateChannel(false);
    } catch (createError) {
      console.error('Error creating channel:', createError);
      setError(createError.message || 'Failed to create channel.');
    } finally {
      setIsCreatingChannel(false);
    }
  };

  const handleJoinChannel = async (channelId) => {
    setJoiningChannelId(channelId);
    setError('');

    try {
      const response = await api.joinChannel(channelId);
      const joinedChannel = response?.channel || response;
      updateChannelCollections(joinedChannel);
      await loadBroadcastData();
      setSelectedChannel(joinedChannel);
    } catch (joinError) {
      console.error('Error joining channel:', joinError);
      setError(joinError.message || 'Failed to join channel.');
    } finally {
      setJoiningChannelId(null);
    }
  };

  const handleCreatePost = async (event) => {
    event.preventDefault();

    if (!selectedChannel?._id || !postInput.trim() || !selectedChannel.canPost) {
      return;
    }

    setIsPosting(true);
    setError('');

    try {
      const createdPost = await api.createChannelPost(selectedChannel._id, {
        content: postInput.trim(),
        messageType: 'text'
      });

      setPostInput('');
      setPosts((currentPosts) => {
        if (currentPosts.some((entry) => idsEqual(entry._id, createdPost._id))) {
          return currentPosts;
        }

        return [...currentPosts, createdPost];
      });

      setChannels((currentChannels) => sortByActivity(currentChannels.map((channel) => (
        idsEqual(channel._id, selectedChannel._id)
          ? {
              ...channel,
              lastActivity: createdPost.createdAt || new Date().toISOString(),
              lastPost: createdPost
            }
          : channel
      ))));
    } catch (postError) {
      console.error('Error creating channel post:', postError);
      setError(postError.message || 'Failed to publish the post.');
    } finally {
      setIsPosting(false);
    }
  };

  const renderChannelItem = (channel, isDiscover = false) => {
    const isSelected = idsEqual(selectedChannel?._id, channel._id) && !isDiscover;
    const subtitle = channel.lastPost?.content?.text || channel.description || 'Broadcast updates will appear here.';

    const content = (
      <div className="flex items-center gap-3 p-3 text-left">
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
          channel.visibility === 'private'
            ? 'bg-gradient-to-br from-indigo-500 to-violet-600'
            : 'bg-gradient-to-br from-sky-500 to-cyan-600'
        }`}>
          {channel.visibility === 'private' ? (
            <Lock className="w-5 h-5 text-white" />
          ) : (
            <MessageCircle className="w-5 h-5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate font-semibold text-white">{channel.name}</p>
            {!isDiscover && (
              <span className="text-[11px] text-white/40">
                {channel.lastActivity ? formatTime(channel.lastActivity) : ''}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-white/55">{subtitle}</p>
          <p className="mt-1 text-[11px] text-white/35">
            {channel.community?.name ? `${channel.community.name} - ` : ''}
            {channel.memberCount || 0} follower{channel.memberCount === 1 ? '' : 's'}
          </p>
        </div>

        {isDiscover ? (
          <button
            type="button"
            onClick={() => handleJoinChannel(channel._id)}
            disabled={joiningChannelId === channel._id}
            className="rounded-xl bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-400 disabled:opacity-60"
          >
            {joiningChannelId === channel._id ? 'Joining...' : 'Follow'}
          </button>
        ) : (
          <div className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
            {channel.canPost ? 'Post' : 'Read'}
          </div>
        )}
      </div>
    );

    return (
      <div
        key={`${isDiscover ? 'discover' : 'joined'}-${channel._id}`}
        className={`w-full rounded-2xl border transition-all ${
          isSelected
            ? 'border-sky-400/30 bg-white/10'
            : 'border-white/5 bg-white/[0.03] hover:bg-white/[0.06]'
        }`}
      >
        {isDiscover ? content : (
          <button type="button" onClick={() => setSelectedChannel(channel)} className="w-full">
            {content}
          </button>
        )}
      </div>
    );
  };

  const renderCommunityItem = (community, isDiscover = false) => (
    <div
      key={`${isDiscover ? 'discover-community' : 'community'}-${community._id}`}
      className="rounded-2xl border border-white/5 bg-white/[0.03]"
    >
      <div className="flex items-center gap-3 p-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${
          community.visibility === 'private'
            ? 'bg-gradient-to-br from-amber-500 to-orange-600'
            : 'bg-gradient-to-br from-emerald-500 to-teal-600'
        }`}>
          {community.visibility === 'private' ? (
            <Lock className="w-5 h-5 text-white" />
          ) : (
            <Users className="w-5 h-5 text-white" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="truncate font-semibold text-white">{community.name}</p>
          <p className="truncate text-sm text-white/55">
            {community.description || `${community.channelCount || 0} channel${community.channelCount === 1 ? '' : 's'}`}
          </p>
        </div>

        {isDiscover ? (
          <button
            type="button"
            onClick={() => handleJoinCommunity(community._id)}
            disabled={joiningCommunityId === community._id}
            className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60"
          >
            {joiningCommunityId === community._id ? 'Joining...' : 'Join'}
          </button>
        ) : (
          <div className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60">
            {community.channelCount || 0} channels
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-full bg-[#0b141a] overflow-hidden">
      <div className={`w-full md:w-80 lg:w-96 flex flex-col flex-shrink-0 ${selectedChannel ? 'hidden md:flex' : 'flex'}`} style={{ background: 'linear-gradient(180deg, rgba(30,30,40,0.95) 0%, rgba(15,15,25,0.98) 100%)', backdropFilter: 'blur(40px) saturate(180%)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
        <div className="p-4 md:p-5 border-b border-white/5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search channels and communities"
              className="w-full pl-11 pr-4 py-3 rounded-2xl text-white/90 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setShowCreateCommunity(false);
                setShowCreateChannel((currentValue) => !currentValue);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sky-100 transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, rgba(14,165,233,0.25) 0%, rgba(59,130,246,0.18) 100%)', border: '1px solid rgba(56,189,248,0.25)' }}
            >
              <Plus className="w-4 h-4" />
              <span className="font-semibold text-sm">New Channel</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateChannel(false);
                setShowCreateCommunity((currentValue) => !currentValue);
              }}
              className="flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-emerald-100 transition-all hover:scale-[1.02]"
              style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.25) 0%, rgba(34,197,94,0.15) 100%)', border: '1px solid rgba(52,211,153,0.25)' }}
            >
              <Users className="w-4 h-4" />
              <span className="font-semibold text-sm">New Community</span>
            </button>
          </div>
        </div>

        {showCreateCommunity && (
          <form onSubmit={handleCreateCommunity} className="m-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Community Name</label>
              <input
                type="text"
                value={communityForm.name}
                onChange={(event) => setCommunityForm((currentValue) => ({ ...currentValue, name: event.target.value }))}
                maxLength={80}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="Campus Creators"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Description</label>
              <textarea
                value={communityForm.description}
                onChange={(event) => setCommunityForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
                maxLength={400}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-400/30"
                placeholder="Coordinate channels around a shared club, class, or project."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['public', 'private'].map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  onClick={() => setCommunityForm((currentValue) => ({ ...currentValue, visibility }))}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    communityForm.visibility === visibility
                      ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {visibility === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button type="submit" disabled={isCreatingCommunity} className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-400 disabled:opacity-60">
                {isCreatingCommunity ? 'Creating...' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowCreateCommunity(false); setCommunityForm(INITIAL_COMMUNITY_FORM); }} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10">
                Cancel
              </button>
            </div>
          </form>
        )}

        {showCreateChannel && (
          <form onSubmit={handleCreateChannel} className="m-3 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Channel Name</label>
              <input
                type="text"
                value={channelForm.name}
                onChange={(event) => setChannelForm((currentValue) => ({ ...currentValue, name: event.target.value }))}
                maxLength={80}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                placeholder="Product Updates"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Description</label>
              <textarea
                value={channelForm.description}
                onChange={(event) => setChannelForm((currentValue) => ({ ...currentValue, description: event.target.value }))}
                maxLength={400}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/30"
                placeholder="Post one-to-many updates, announcements, and release notes."
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              {['public', 'private'].map((visibility) => (
                <button
                  key={visibility}
                  type="button"
                  onClick={() => setChannelForm((currentValue) => ({ ...currentValue, visibility }))}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    channelForm.visibility === visibility
                      ? 'border-sky-400/40 bg-sky-500/20 text-sky-100'
                      : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
                  }`}
                >
                  {visibility === 'public' ? 'Public' : 'Private'}
                </button>
              ))}
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-white/50">Community</label>
              <select
                value={channelForm.communityId}
                onChange={(event) => setChannelForm((currentValue) => ({ ...currentValue, communityId: event.target.value }))}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-400/30"
              >
                <option value="">Standalone channel</option>
                {communities.map((community) => (
                  <option key={community._id} value={community._id}>
                    {community.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => setChannelForm((currentValue) => ({ ...currentValue, allowMemberPosts: !currentValue.allowMemberPosts }))}
              className={`w-full rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                channelForm.allowMemberPosts
                  ? 'border-sky-400/40 bg-sky-500/20 text-sky-100'
                  : 'border-white/10 bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {channelForm.allowMemberPosts ? 'Members can comment' : 'Admins only can post'}
            </button>

            <div className="flex gap-2">
              <button type="submit" disabled={isCreatingChannel} className="flex-1 rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-400 disabled:opacity-60">
                {isCreatingChannel ? 'Creating...' : 'Create'}
              </button>
              <button type="button" onClick={() => { setShowCreateChannel(false); setChannelForm(INITIAL_CHANNEL_FORM); }} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white/70 transition-colors hover:bg-white/10">
                Cancel
              </button>
            </div>
          </form>
        )}

        {error && (
          <div className="mx-3 mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {error}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-5">
          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Your Channels</div>
            {isLoading ? (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">Loading channels...</div>
            ) : filteredChannels.length > 0 ? (
              filteredChannels.map((channel) => renderChannelItem(channel))
            ) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No followed channels yet. Create one or discover a public channel below.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Your Communities</div>
            {filteredCommunities.length > 0 ? filteredCommunities.map((community) => renderCommunityItem(community)) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No joined communities yet. Create one or join a public community below.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Discover Channels</div>
            {filteredDiscoverChannels.length > 0 ? filteredDiscoverChannels.map((channel) => renderChannelItem(channel, true)) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No public channels match this search right now.
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">Discover Communities</div>
            {filteredDiscoverCommunities.length > 0 ? filteredDiscoverCommunities.map((community) => renderCommunityItem(community, true)) : (
              <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-4 py-6 text-sm text-white/50">
                No public communities match this search right now.
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedChannel ? (
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-[#0b141a]">
          <div className="absolute top-0 left-0 right-0 z-20 h-16 px-4 flex items-center justify-between border-b border-white/5 bg-slate-900/20 backdrop-blur-2xl">
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setSelectedChannel(null)} className="md:hidden p-2 rounded-full text-slate-200 transition-colors hover:bg-white/10">
                <ArrowLeft className="w-5 h-5" />
              </button>

              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                selectedChannel.visibility === 'private'
                  ? 'bg-gradient-to-br from-indigo-500 to-violet-600'
                  : 'bg-gradient-to-br from-sky-500 to-cyan-600'
              }`}>
                {selectedChannel.visibility === 'private' ? <Lock className="w-5 h-5 text-white" /> : <Globe className="w-5 h-5 text-white" />}
              </div>

              <div>
                <p className="font-semibold text-white">{selectedChannel.name}</p>
                <p className="text-xs text-slate-400">
                  {selectedChannel.community?.name ? `${selectedChannel.community.name} - ` : ''}
                  {selectedChannel.memberCount || 0} follower{selectedChannel.memberCount === 1 ? '' : 's'}
                </p>
              </div>
            </div>

            <div className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-white/60">
              {selectedChannel.canPost ? 'Broadcast + replies' : 'Broadcast only'}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 md:p-6 pt-20 space-y-3 bg-[#0b141a]" style={{ backgroundImage: "url('data:image/svg+xml,%3Csvg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cpath d=\"M0 0h100v100H0z\" fill=\"%230b141a\"/%3E%3Cpath d=\"M20 20h60v60H20z\" fill=\"%23121a22\" opacity=\".05\"/%3E%3C/svg%3E')", backgroundSize: '40px 40px' }}>
            <div className="flex justify-center">
              <div className="rounded-xl border border-white/5 bg-slate-900/50 px-4 py-2 shadow-sm">
                <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                  <Zap className="w-3 h-3 text-yellow-500" />
                  <span>Channels are broadcast surfaces. Posts sync in real time and remain server-readable for moderation and discovery.</span>
                </p>
              </div>
            </div>

            {posts.length === 0 ? (
              <div className="mx-auto max-w-lg rounded-3xl border border-white/5 bg-white/[0.03] px-6 py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10">
                  <MessageCircle className="h-8 w-8 text-sky-300/80" />
                </div>
                <h3 className="text-xl font-semibold text-white">Channel feed is ready</h3>
                <p className="mt-3 text-sm leading-relaxed text-white/55">
                  {selectedChannel.canPost
                    ? 'Publish announcements, updates, and useful one-to-many messages here.'
                    : 'This channel is read-only for followers. New posts from admins will appear here in real time.'}
                </p>
              </div>
            ) : posts.map((post) => {
              const isOwn = idsEqual(post.author?._id || post.author, user?._id || user?.id);

              return (
                <div key={post._id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] sm:max-w-[78%] md:max-w-[72%] rounded-2xl px-4 py-3 shadow-md ${
                    isOwn
                      ? 'bg-[#005c4b] text-white rounded-br-none'
                      : 'bg-[#202c33] text-[#e9edef] rounded-bl-none'
                  }`}>
                    {!isOwn && (
                      <p className="mb-1 text-xs font-semibold text-sky-300">
                        {post.author?.username || 'Channel admin'}
                      </p>
                    )}
                    <p className="break-words whitespace-pre-wrap">{post.content?.text || ''}</p>
                    <div className="mt-2 flex items-center justify-end gap-2 text-xs text-[#8696a0]">
                      {post.isEdited && <span>edited</span>}
                      <span>{formatTime(post.createdAt)}</span>
                    </div>
                  </div>
                </div>
              );
            })}

            <div ref={postsEndRef} />
          </div>

          <div className="p-4 md:p-5 bg-[#0b141a]">
            <form onSubmit={handleCreatePost} className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={postInput}
                  onChange={(event) => setPostInput(event.target.value)}
                  disabled={!selectedChannel.canPost || isPosting}
                  placeholder={selectedChannel.canPost ? 'Publish an update' : 'Only channel admins can post here'}
                  className="w-full rounded-3xl border border-white/10 px-5 py-3.5 text-[#e9edef] placeholder-[#8696a0] focus:outline-none focus:border-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                  style={{ background: 'rgba(15,23,42,0.8)' }}
                />
              </div>

              <button
                type="submit"
                disabled={!postInput.trim() || !selectedChannel.canPost || isPosting}
                className="rounded-2xl bg-sky-500 p-3.5 transition-all disabled:cursor-not-allowed disabled:opacity-50 hover:bg-sky-400"
                title="Publish post"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center bg-[#0b141a] min-w-0">
          <div className="max-w-md px-6 text-center">
            <div className="mx-auto mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-sky-500/10">
              <MessageCircle className="h-20 w-20 text-sky-300/60" />
            </div>
            <h3 className="text-3xl font-light text-[#e9edef]">Channels And Communities</h3>
            <p className="mt-3 text-sm leading-relaxed text-[#8696a0]">
              Run broadcast channels, organize them inside communities, and deliver updates in real time from the same chat hub.
            </p>
            <div className="mt-6 flex items-center justify-center gap-2 text-xs text-[#667781]">
              <Users className="w-4 h-4" />
              <span>Public channels are discoverable. Private ones stay invite-only.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChannelsPage;
