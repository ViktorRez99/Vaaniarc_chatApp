const express = require('express');
const router = express.Router();
const Meeting = require('../models/Meeting');
const User = require('../models/User');

// Create a new meeting
router.post('/meetings', async (req, res) => {
  try {
    const { title, scheduledAt, settings } = req.body;
    const userId = req.user._id;

    const meeting = new Meeting({
      title: title || 'Instant Meeting',
      host: userId,
      scheduledAt: scheduledAt || null,
      settings: settings || {},
      status: scheduledAt ? 'scheduled' : 'active',
      startedAt: scheduledAt ? null : new Date()
    });

    await meeting.save();
    await meeting.populate('host', 'username avatar');

    res.status(201).json(meeting);
  } catch (error) {
    console.error('Error creating meeting:', error);
    res.status(500).json({ message: 'Failed to create meeting' });
  }
});

// Get all meetings for user
router.get('/meetings', async (req, res) => {
  try {
    const userId = req.user._id;
    const { status } = req.query;

    const query = {
      $or: [
        { host: userId },
        { 'participants.user': userId }
      ]
    };

    if (status) {
      query.status = status;
    }

    const meetings = await Meeting.find(query)
      .populate('host', 'username avatar')
      .populate('participants.user', 'username avatar')
      .sort({ createdAt: -1 });

    res.json(meetings);
  } catch (error) {
    console.error('Error fetching meetings:', error);
    res.status(500).json({ message: 'Failed to fetch meetings' });
  }
});

// Get a specific meeting
router.get('/meetings/:meetingId', async (req, res) => {
  try {
    const { meetingId } = req.params;

    const meeting = await Meeting.findOne({ meetingId })
      .populate('host', 'username avatar')
      .populate('participants.user', 'username avatar status');

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    res.json(meeting);
  } catch (error) {
    console.error('Error fetching meeting:', error);
    res.status(500).json({ message: 'Failed to fetch meeting' });
  }
});

// Join a meeting
router.post('/meetings/:meetingId/join', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Check if user is already in the meeting
    const alreadyJoined = meeting.participants.some(
      p => p.user.toString() === userId.toString() && !p.leftAt
    );

    if (!alreadyJoined) {
      meeting.participants.push({
        user: userId,
        joinedAt: new Date()
      });

      // Update meeting status to active if it's scheduled
      if (meeting.status === 'scheduled') {
        meeting.status = 'active';
        meeting.startedAt = new Date();
      }

      await meeting.save();
    }

    await meeting.populate('host', 'username avatar');
    await meeting.populate('participants.user', 'username avatar status');

    res.json(meeting);
  } catch (error) {
    console.error('Error joining meeting:', error);
    res.status(500).json({ message: 'Failed to join meeting' });
  }
});

// Leave a meeting
router.post('/meetings/:meetingId/leave', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Mark user as left
    const participant = meeting.participants.find(
      p => p.user.toString() === userId.toString() && !p.leftAt
    );

    if (participant) {
      participant.leftAt = new Date();
    }

    // Check if all participants have left
    const activeParticipants = meeting.participants.filter(p => !p.leftAt);
    
    if (activeParticipants.length === 0 && meeting.status === 'active') {
      meeting.status = 'ended';
      meeting.endedAt = new Date();
    }

    await meeting.save();

    res.json({ message: 'Left meeting successfully', meeting });
  } catch (error) {
    console.error('Error leaving meeting:', error);
    res.status(500).json({ message: 'Failed to leave meeting' });
  }
});

// End a meeting (host only)
router.post('/meetings/:meetingId/end', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;

    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Check if user is the host
    if (meeting.host.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the host can end the meeting' });
    }

    meeting.status = 'ended';
    meeting.endedAt = new Date();

    // Mark all participants as left
    meeting.participants.forEach(p => {
      if (!p.leftAt) {
        p.leftAt = new Date();
      }
    });

    await meeting.save();

    res.json({ message: 'Meeting ended successfully', meeting });
  } catch (error) {
    console.error('Error ending meeting:', error);
    res.status(500).json({ message: 'Failed to end meeting' });
  }
});

// Update meeting settings (host only)
router.patch('/meetings/:meetingId/settings', async (req, res) => {
  try {
    const { meetingId } = req.params;
    const userId = req.user._id;
    const { settings } = req.body;

    const meeting = await Meeting.findOne({ meetingId });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Check if user is the host
    if (meeting.host.toString() !== userId.toString()) {
      return res.status(403).json({ message: 'Only the host can update settings' });
    }

    meeting.settings = { ...meeting.settings, ...settings };
    await meeting.save();

    res.json(meeting);
  } catch (error) {
    console.error('Error updating meeting settings:', error);
    res.status(500).json({ message: 'Failed to update meeting settings' });
  }
});

module.exports = router;
