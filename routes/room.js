const express = require('express');
const router = express.Router();
const Room = require('../models/Room');
const Message = require('../models/Message');
const User = require('../models/User');

// Get all rooms for the authenticated user
router.get('/rooms', async (req, res) => {
  try {
    const userId = req.user._id;
    const { type } = req.query; // 'public', 'private', or undefined for all
    
    const query = {
      'members.user': userId,
      isActive: true
    };

    if (type && ['public', 'private'].includes(type)) {
      query.type = type;
    }
    
    const rooms = await Room.find(query)
      .populate('creator', 'username avatar')
      .populate('members.user', 'username avatar status')
      .sort({ lastActivity: -1 });
    
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ message: 'Failed to fetch rooms' });
  }
});

// Get all public rooms (for discovery)
router.get('/rooms/public', async (req, res) => {
  try {
    const { search, limit = 20 } = req.query;
    
    const query = {
      type: 'public',
      isActive: true
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const rooms = await Room.find(query)
      .populate('creator', 'username avatar')
      .select('name description type creator members maxMembers lastActivity')
      .sort({ lastActivity: -1 })
      .limit(parseInt(limit));
    
    res.json(rooms);
  } catch (error) {
    console.error('Error fetching public rooms:', error);
    res.status(500).json({ message: 'Failed to fetch public rooms' });
  }
});

// Create a new room
router.post('/rooms', async (req, res) => {
  try {
    const { name, description, type = 'public', maxMembers = 100 } = req.body;
    const userId = req.user._id;

    // Validation
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ message: 'Room name is required' });
    }

    if (name.length > 50) {
      return res.status(400).json({ message: 'Room name must be 50 characters or less' });
    }

    if (description && description.length > 200) {
      return res.status(400).json({ message: 'Description must be 200 characters or less' });
    }

    if (!['public', 'private'].includes(type)) {
      return res.status(400).json({ message: 'Invalid room type' });
    }

    // Create room
    const room = new Room({
      name: name.trim(),
      description: description ? description.trim() : '',
      type,
      creator: userId,
      maxMembers,
      members: [{
        user: userId,
        role: 'admin',
        joinedAt: new Date()
      }],
      admins: [userId]
    });

    await room.save();
    
    // Populate creator and members
    await room.populate('creator', 'username avatar');
    await room.populate('members.user', 'username avatar status');

    res.status(201).json(room);
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ message: 'Failed to create room' });
  }
});

// Get room details
router.get('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId)
      .populate('creator', 'username avatar')
      .populate('members.user', 'username avatar status bio')
      .populate('admins', 'username avatar')
      .populate('moderators', 'username avatar');

    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // For private rooms, check if user is a member
    if (room.type === 'private' && !room.isMember(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(room);
  } catch (error) {
    console.error('Error fetching room details:', error);
    res.status(500).json({ message: 'Failed to fetch room details' });
  }
});

// Update room settings (admin only)
router.patch('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { name, description, maxMembers, settings } = req.body;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is admin
    if (!room.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can update room settings' });
    }

    // Update fields
    if (name && name.trim().length > 0) {
      if (name.length > 50) {
        return res.status(400).json({ message: 'Room name must be 50 characters or less' });
      }
      room.name = name.trim();
    }

    if (description !== undefined) {
      if (description.length > 200) {
        return res.status(400).json({ message: 'Description must be 200 characters or less' });
      }
      room.description = description.trim();
    }

    if (maxMembers) {
      if (maxMembers < room.members.length) {
        return res.status(400).json({ 
          message: 'Cannot set max members below current member count' 
        });
      }
      room.maxMembers = maxMembers;
    }

    if (settings) {
      if (settings.allowFileSharing !== undefined) {
        room.settings.allowFileSharing = settings.allowFileSharing;
      }
      if (settings.allowInvites !== undefined) {
        room.settings.allowInvites = settings.allowInvites;
      }
      if (settings.muteNotifications !== undefined) {
        room.settings.muteNotifications = settings.muteNotifications;
      }
    }

    await room.save();
    await room.populate('creator', 'username avatar');
    await room.populate('members.user', 'username avatar status');

    res.json(room);
  } catch (error) {
    console.error('Error updating room:', error);
    res.status(500).json({ message: 'Failed to update room' });
  }
});

// Join a room
router.post('/rooms/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if room is full
    if (room.members.length >= room.maxMembers) {
      return res.status(400).json({ message: 'Room is full' });
    }

    // Check if user is already a member
    if (room.isMember(userId)) {
      return res.status(400).json({ message: 'You are already a member of this room' });
    }

    // For private rooms, check if invites are allowed
    if (room.type === 'private' && !room.settings.allowInvites) {
      return res.status(403).json({ message: 'This room does not allow new members' });
    }

    // Add member
    room.addMember(userId);
    await room.save();

    await room.populate('members.user', 'username avatar status');

    res.json({
      message: 'Successfully joined the room',
      room
    });
  } catch (error) {
    console.error('Error joining room:', error);
    res.status(500).json({ message: 'Failed to join room' });
  }
});

// Leave a room
router.post('/rooms/:roomId/leave', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is a member
    if (!room.isMember(userId)) {
      return res.status(400).json({ message: 'You are not a member of this room' });
    }

    // Don't allow creator to leave if there are other members
    if (room.creator.toString() === userId.toString() && room.members.length > 1) {
      return res.status(400).json({ 
        message: 'Creator must transfer ownership or remove all members before leaving' 
      });
    }

    // Remove member
    room.removeMember(userId);

    // If room is empty, deactivate it
    if (room.members.length === 0) {
      room.isActive = false;
    }

    await room.save();

    res.json({
      message: 'Successfully left the room'
    });
  } catch (error) {
    console.error('Error leaving room:', error);
    res.status(500).json({ message: 'Failed to leave room' });
  }
});

// Add member to room (admin only)
router.post('/rooms/:roomId/members', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { userId: targetUserId, role = 'member' } = req.body;
    const userId = req.user._id;

    if (!targetUserId) {
      return res.status(400).json({ message: 'User ID is required' });
    }

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is admin
    if (!room.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can add members' });
    }

    // Check if room is full
    if (room.members.length >= room.maxMembers) {
      return res.status(400).json({ message: 'Room is full' });
    }

    // Check if target user exists
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is already a member
    if (room.isMember(targetUserId)) {
      return res.status(400).json({ message: 'User is already a member of this room' });
    }

    // Add member
    const added = room.addMember(targetUserId, role);
    if (added) {
      await room.save();
      await room.populate('members.user', 'username avatar status');

      res.json({
        message: 'Member added successfully',
        room
      });
    } else {
      res.status(400).json({ message: 'Failed to add member' });
    }
  } catch (error) {
    console.error('Error adding member:', error);
    res.status(500).json({ message: 'Failed to add member' });
  }
});

// Remove member from room (admin only)
router.delete('/rooms/:roomId/members/:userId', async (req, res) => {
  try {
    const { roomId, userId: targetUserId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is admin
    if (!room.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    // Cannot remove creator
    if (room.creator.toString() === targetUserId) {
      return res.status(400).json({ message: 'Cannot remove the room creator' });
    }

    // Check if target user is a member
    if (!room.isMember(targetUserId)) {
      return res.status(400).json({ message: 'User is not a member of this room' });
    }

    // Remove member
    room.removeMember(targetUserId);
    await room.save();

    res.json({
      message: 'Member removed successfully'
    });
  } catch (error) {
    console.error('Error removing member:', error);
    res.status(500).json({ message: 'Failed to remove member' });
  }
});

// Update member role (admin only)
router.patch('/rooms/:roomId/members/:userId/role', async (req, res) => {
  try {
    const { roomId, userId: targetUserId } = req.params;
    const { role } = req.body;
    const userId = req.user._id;

    if (!['member', 'moderator', 'admin'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is admin
    if (!room.isAdmin(userId)) {
      return res.status(403).json({ message: 'Only admins can change member roles' });
    }

    // Cannot change creator's role
    if (room.creator.toString() === targetUserId) {
      return res.status(400).json({ message: 'Cannot change the creator\'s role' });
    }

    // Find and update member
    const member = room.members.find(m => m.user.toString() === targetUserId);
    if (!member) {
      return res.status(404).json({ message: 'Member not found in this room' });
    }

    // Update role arrays
    room.admins = room.admins.filter(id => id.toString() !== targetUserId);
    room.moderators = room.moderators.filter(id => id.toString() !== targetUserId);

    if (role === 'admin') {
      room.admins.push(targetUserId);
    } else if (role === 'moderator') {
      room.moderators.push(targetUserId);
    }

    member.role = role;
    await room.save();

    await room.populate('members.user', 'username avatar status');

    res.json({
      message: 'Member role updated successfully',
      room
    });
  } catch (error) {
    console.error('Error updating member role:', error);
    res.status(500).json({ message: 'Failed to update member role' });
  }
});

// Get room messages
router.get('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { limit = 50, before } = req.query;
    const userId = req.user._id;

    // Verify room exists and user is a member
    const room = await Room.findById(roomId);
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // For private rooms, check membership
    if (room.type === 'private' && !room.isMember(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Build query
    const query = { 
      room: roomId,
      isDeleted: false
    };
    
    if (before) {
      query.createdAt = { $lt: new Date(before) };
    }

    const messages = await Message.find(query)
      .populate('sender', 'username avatar')
      .populate('replyTo', 'content sender')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(messages.reverse());
  } catch (error) {
    console.error('Error fetching room messages:', error);
    res.status(500).json({ message: 'Failed to fetch room messages' });
  }
});

// Send message to room
router.post('/rooms/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;
    const { text, messageType = 'text', replyTo } = req.body;
    const userId = req.user._id;

    // Verify room exists and user is a member
    const room = await Room.findById(roomId);
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    if (!room.isMember(userId)) {
      return res.status(403).json({ message: 'You must be a member to send messages' });
    }

    // Validate message
    if (!text || text.trim().length === 0) {
      return res.status(400).json({ message: 'Message content cannot be empty' });
    }

    if (text.length > 2000) {
      return res.status(400).json({ message: 'Message must be 2000 characters or less' });
    }

    // Create message
    const message = new Message({
      sender: userId,
      room: roomId,
      content: { text: text.trim() },
      messageType,
      isPrivate: false,
      replyTo: replyTo || null
    });

    await message.save();
    
    // Update room activity
    await room.updateActivity();

    // Populate sender information
    await message.populate('sender', 'username avatar');
    if (replyTo) {
      await message.populate('replyTo', 'content sender');
    }

    res.status(201).json(message);
  } catch (error) {
    console.error('Error sending room message:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// Delete room (creator only)
router.delete('/rooms/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    
    if (!room) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Only creator can delete room
    if (room.creator.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the creator can delete this room' });
    }

    // Soft delete - set to inactive
    room.isActive = false;
    await room.save();

    res.json({
      message: 'Room deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ message: 'Failed to delete room' });
  }
});

// Get room statistics (admin only)
router.get('/rooms/:roomId/stats', async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const room = await Room.findById(roomId);
    
    if (!room || !room.isActive) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Check if user is admin or moderator
    if (!room.isAdmin(userId) && !room.moderators.includes(userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }

    // Get message count
    const messageCount = await Message.countDocuments({
      room: roomId,
      isDeleted: false
    });

    // Get active members (members with recent activity)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const activeMembers = await Message.distinct('sender', {
      room: roomId,
      createdAt: { $gte: oneDayAgo },
      isDeleted: false
    });

    res.json({
      totalMembers: room.members.length,
      maxMembers: room.maxMembers,
      messageCount,
      activeMembersToday: activeMembers.length,
      createdAt: room.createdAt,
      lastActivity: room.lastActivity
    });
  } catch (error) {
    console.error('Error fetching room stats:', error);
    res.status(500).json({ message: 'Failed to fetch room stats' });
  }
});

module.exports = router;
