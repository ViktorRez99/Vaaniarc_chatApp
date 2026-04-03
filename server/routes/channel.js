const express = require('express');

const Channel = require('../models/Channel');
const ChannelPost = require('../models/ChannelPost');
const Community = require('../models/Community');
const { buildUniqueSlug } = require('../utils/slug');
const logger = require('../utils/logger');
const { arrayIncludesId, normalizeId } = require('../utils/idHelpers');
const { buildConversationId } = require('../utils/conversationHelpers');

const router = express.Router();

const CHANNEL_POST_FIELDS = 'channel content messageType isPinned isEdited editedAt createdAt updatedAt author';

const serializeChannelPost = (post) => ({
  _id: post._id,
  id: post._id,
  channel: post.channel,
  author: post.author,
  content: {
    text: post.content?.text || ''
  },
  messageType: post.messageType,
  isPinned: Boolean(post.isPinned),
  isEdited: Boolean(post.isEdited),
  editedAt: post.editedAt || null,
  createdAt: post.createdAt,
  updatedAt: post.updatedAt
});

const serializeChannel = (channel, userId, lastPost = null) => ({
  _id: channel._id,
  conversationId: buildConversationId('channel', normalizeId(channel._id)),
  name: channel.name,
  slug: channel.slug,
  description: channel.description || '',
  visibility: channel.visibility,
  owner: channel.owner,
  admins: channel.admins || [],
  community: channel.community || null,
  settings: channel.settings || { allowMemberPosts: false },
  memberCount: Array.isArray(channel.members) ? channel.members.length : 0,
  isJoined: arrayIncludesId(
    (channel.members || []).map((member) => member.user || member),
    userId
  ),
  canPost: typeof channel.canPost === 'function'
    ? channel.canPost(userId)
    : false,
  lastActivity: channel.lastActivity || channel.updatedAt,
  lastPost: lastPost ? serializeChannelPost(lastPost) : null,
  createdAt: channel.createdAt,
  updatedAt: channel.updatedAt
});

const loadLatestPosts = async (channelIds) => {
  if (!channelIds.length) {
    return new Map();
  }

  const latestPosts = await ChannelPost.find({
    channel: { $in: channelIds }
  })
    .select(`channel ${CHANNEL_POST_FIELDS}`)
    .populate('author', 'username avatar')
    .sort({ createdAt: -1 });

  const latestPostByChannelId = new Map();
  latestPosts.forEach((post) => {
    const channelId = normalizeId(post.channel);
    if (!latestPostByChannelId.has(channelId)) {
      latestPostByChannelId.set(channelId, post);
    }
  });

  return latestPostByChannelId;
};

const ensureCommunityAccessForChannel = async (communityId, userId, visibility) => {
  if (!communityId) {
    return null;
  }

  const community = await Community.findById(communityId);

  if (!community || !community.isActive) {
    throw new Error('Community not found');
  }

  if (!community.isMember(userId)) {
    throw new Error('You must join the community before creating a channel in it');
  }

  if (community.visibility === 'private' && visibility !== 'private') {
    throw new Error('Channels inside a private community must also be private');
  }

  return community;
};

router.get('/channels', async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = '' } = req.query;
    const query = {
      isActive: true,
      'members.user': userId
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const channels = await Channel.find(query)
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .populate('community', 'name slug visibility')
      .sort({ lastActivity: -1 });

    const latestPostByChannelId = await loadLatestPosts(channels.map((channel) => channel._id));

    res.json(channels.map((channel) => (
      serializeChannel(channel, userId, latestPostByChannelId.get(normalizeId(channel._id)) || null)
    )));
  } catch (error) {
    logger.error('Channel list error', error);
    res.status(500).json({ message: 'Failed to fetch channels' });
  }
});

router.get('/channels/discover', async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = '', limit = 20 } = req.query;
    const joinedChannels = await Channel.find({
      isActive: true,
      'members.user': userId
    }).select('_id').lean();

    const query = {
      isActive: true,
      visibility: 'public',
      _id: {
        $nin: joinedChannels.map((channel) => channel._id)
      }
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const channels = await Channel.find(query)
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .populate('community', 'name slug visibility')
      .sort({ lastActivity: -1 })
      .limit(Math.min(Number.parseInt(limit, 10) || 20, 50));

    const latestPostByChannelId = await loadLatestPosts(channels.map((channel) => channel._id));

    res.json(channels.map((channel) => (
      serializeChannel(channel, userId, latestPostByChannelId.get(normalizeId(channel._id)) || null)
    )));
  } catch (error) {
    logger.error('Channel discover error', error);
    res.status(500).json({ message: 'Failed to discover channels' });
  }
});

router.post('/channels', async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      name,
      description = '',
      visibility = 'public',
      communityId = null,
      allowMemberPosts = false
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Channel name is required' });
    }

    if (!['public', 'private'].includes(visibility)) {
      return res.status(400).json({ message: 'Invalid channel visibility' });
    }

    let community = null;

    try {
      community = await ensureCommunityAccessForChannel(communityId, userId, visibility);
    } catch (error) {
      return res.status(error.message === 'Community not found' ? 404 : 403).json({ message: error.message });
    }

    const channel = await Channel.create({
      name: String(name).trim(),
      slug: await buildUniqueSlug(Channel, name),
      description: String(description || '').trim(),
      visibility,
      owner: userId,
      admins: [userId],
      members: [{
        user: userId,
        role: 'owner',
        joinedAt: new Date()
      }],
      community: community?._id || null,
      settings: {
        allowMemberPosts: Boolean(allowMemberPosts)
      }
    });

    if (community) {
      community.channels.addToSet(channel._id);
      community.lastActivity = new Date();
      await community.save();
    }

    await channel.populate('owner', 'username avatar');
    await channel.populate('admins', 'username avatar');
    await channel.populate('community', 'name slug visibility');

    res.status(201).json(serializeChannel(channel, userId));
  } catch (error) {
    logger.error('Channel creation error', error);
    res.status(500).json({ message: 'Failed to create channel' });
  }
});

router.post('/channels/:channelId/join', async (req, res) => {
  try {
    const { channelId } = req.params;
    const userId = req.user._id;
    const channel = await Channel.findById(channelId)
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .populate('community');

    if (!channel || !channel.isActive) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (channel.visibility !== 'public') {
      return res.status(403).json({ message: 'This channel requires an invite' });
    }

    if (channel.isMember(userId)) {
      return res.status(400).json({ message: 'You are already following this channel' });
    }

    if (channel.community) {
      const community = await Community.findById(channel.community._id || channel.community);

      if (community) {
        if (community.visibility === 'private' && !community.isMember(userId)) {
          return res.status(403).json({ message: 'Join the community before following this channel' });
        }

        if (community.visibility === 'public' && !community.isMember(userId)) {
          community.addMember(userId);
          community.lastActivity = new Date();
          await community.save();
        }
      }
    }

    channel.addMember(userId);
    channel.lastActivity = new Date();
    await channel.save();
    await channel.populate('community', 'name slug visibility');

    res.json({
      message: 'Successfully joined the channel',
      channel: serializeChannel(channel, userId)
    });
  } catch (error) {
    logger.error('Channel join error', error);
    res.status(500).json({ message: 'Failed to join channel' });
  }
});

router.get('/channels/:channelId/posts', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user._id;
    const channel = await Channel.findById(channelId);

    if (!channel || !channel.isActive) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.canView(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const query = { channel: channel._id };

    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const posts = await ChannelPost.find(query)
      .populate('author', 'username avatar')
      .sort({ createdAt: -1 })
      .limit(Math.min(Number.parseInt(limit, 10) || 50, 100));

    res.json(posts.reverse().map(serializeChannelPost));
  } catch (error) {
    logger.error('Channel post fetch error', error);
    res.status(500).json({ message: 'Failed to fetch channel posts' });
  }
});

router.post('/channels/:channelId/posts', async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, messageType = 'text' } = req.body;
    const userId = req.user._id;
    const channel = await Channel.findById(channelId)
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .populate('community', 'name slug visibility');

    if (!channel || !channel.isActive) {
      return res.status(404).json({ message: 'Channel not found' });
    }

    if (!channel.canPost(userId)) {
      return res.status(403).json({ message: 'Only channel admins can post here' });
    }

    const nextContent = String(content || '').trim();

    if (!nextContent) {
      return res.status(400).json({ message: 'Post content cannot be empty' });
    }

    if (!['text', 'announcement', 'system'].includes(messageType)) {
      return res.status(400).json({ message: 'Invalid channel post type' });
    }

    const post = await ChannelPost.create({
      channel: channel._id,
      author: userId,
      content: { text: nextContent },
      messageType
    });

    channel.lastActivity = new Date();
    await channel.save();

    const populatedPost = await ChannelPost.findById(post._id)
      .populate('author', 'username avatar');

    const serializedPost = serializeChannelPost(populatedPost);
    const io = req.app.get('io');

    if (io) {
      io.to(`channel:${normalizeId(channel._id)}`).emit('channel_post', {
        channelId: normalizeId(channel._id),
        post: serializedPost
      });
    }

    res.status(201).json(serializedPost);
  } catch (error) {
    logger.error('Channel post creation error', error);
    res.status(500).json({ message: 'Failed to publish channel post' });
  }
});

module.exports = router;
