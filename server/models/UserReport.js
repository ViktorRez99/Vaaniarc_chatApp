const mongoose = require('mongoose');

const userReportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reported: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reason: {
    type: String,
    trim: true,
    maxlength: 80,
    default: 'abuse'
  },
  details: {
    type: String,
    trim: true,
    maxlength: 1000,
    default: ''
  },
  status: {
    type: String,
    enum: ['open', 'reviewing', 'resolved', 'dismissed'],
    default: 'open',
    index: true
  }
}, {
  timestamps: true
});

userReportSchema.index({ reporter: 1, reported: 1, createdAt: -1 });

module.exports = mongoose.model('UserReport', userReportSchema);
