const express = require('express');

const Community = require('../models/Community');
const { buildUniqueSlug } = require('../utils/slug');
const logger = require('../utils/logger');
const { arrayIncludesId } = require('../utils/idHelpers');
const { buildSafeSearchRegex } = require('../utils/validation');

const router = express.Router();

const serializeCommunity = (community, userId) => ({
  _id: community._id,
  name: community.name,
  slug: community.slug,
  description: community.description || '',
  visibility: community.visibility,
  owner: community.owner,
  admins: community.admins || [],
  channelCount: Array.isArray(community.channels) ? community.channels.length : 0,
  memberCount: Array.isArray(community.members) ? community.members.length : 0,
  isJoined: arrayIncludesId(
    (community.members || []).map((member) => member.user || member),
    userId
  ),
  lastActivity: community.lastActivity || community.updatedAt,
  createdAt: community.createdAt,
  updatedAt: community.updatedAt
});

router.get('/communities', async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = '' } = req.query;
    const query = {
      isActive: true,
      'members.user': userId
    };

    if (search) {
      const safeRegex = buildSafeSearchRegex(search);
      query.$or = [
        { name: safeRegex },
        { description: safeRegex }
      ];
    }

    const communities = await Community.find(query)
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar')
      .sort({ lastActivity: -1 });

    res.json({
      communities: communities.map((c) => ({...serializeCommunity(c, userId), isJoined: true}))
    });
  } catch (error) {
    logger.error('Community list error', error);
    res.status(500).json({ message: 'Failed to load communities' });
  }
});

router.get('/communities/discover', async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = '', limit = 20 } = req.query;
    const joinedCommunities = await Community.find({
      isActive: true,
      'members.user': userId
    }).select('_id').lean();

    const query = {
      isActive: true,
      visibility: 'public',
      _id: {
        $nin: joinedCommunities.map((community) => community._id)
      }
    };

    if (search) {
      const safeRegex = buildSafeSearchRegex(search);
      query.$or = [
        { name: safeRegex },
        { description: safeRegex }
      ];
    }

    const communities = await Community.find(query)
      .populate('owner', 'username avatar')
      .sort({ lastActivity: -1 })
      .limit(Math.min(Number.parseInt(limit, 10) || 20, 50));

    res.json(communities.map((community) => serializeCommunity(community, userId)));
  } catch (error) {
    logger.error('Community discover error', error);
    res.status(500).json({ message: 'Failed to discover communities' });
  }
});

router.post('/communities', async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, description = '', visibility = 'public' } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Community name is required' });
    }

    if (!['public', 'private'].includes(visibility)) {
      return res.status(400).json({ message: 'Invalid community visibility' });
    }

    const community = await Community.create({
      name: String(name).trim(),
      slug: await buildUniqueSlug(Community, name),
      description: String(description || '').trim(),
      visibility,
      owner: userId,
      admins: [userId],
      members: [{
        user: userId,
        role: 'owner',
        joinedAt: new Date()
      }]
    });

    await community.populate('owner', 'username avatar');
    await community.populate('admins', 'username avatar');

    res.status(201).json(serializeCommunity(community, userId));
  } catch (error) {
    logger.error('Community creation error', error);
    res.status(500).json({ message: 'Failed to create community' });
  }
});

router.post('/communities/:communityId/join', async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.user._id;
    const community = await Community.findById(communityId)
      .populate('owner', 'username avatar')
      .populate('admins', 'username avatar');

    if (!community || !community.isActive) {
      return res.status(404).json({ message: 'Community not found' });
    }

    if (community.visibility !== 'public') {
      return res.status(403).json({ message: 'This community requires an invite' });
    }

    if (community.isMember(userId)) {
      return res.status(400).json({ message: 'You are already a member of this community' });
    }

    community.addMember(userId);
    community.lastActivity = new Date();
    await community.save();

    res.json({
      message: 'Successfully joined the community',
      community: serializeCommunity(community, userId)
    });
  } catch (error) {
    logger.error('Community join error', error);
    res.status(500).json({ message: 'Failed to join community' });
  }
});

module.exports = router;
