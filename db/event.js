import mongoose from 'mongoose';

const eventSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  targetRoles: [{
    type: String,
    trim: true
  }],
  teamStats: [{
    roleId: String,
    totalTime: {
      type: Number,
      default: 0
    },
    memberCount: {
      type: Number,
      default: 0
    },
    dailyChange: {
      type: Number,
      default: 0
    },
    lastUpdated: Date,
    topMembers: [{
      userId: String,
      username: String,
      totalTime: Number,
      sessions: Number
    }]
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: String,
    required: true
  },
  guildId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient querying
eventSchema.index({ guildId: 1, startDate: 1, endDate: 1 });
eventSchema.index({ status: 1, endDate: 1 });

// Method to find overlapping events
eventSchema.statics.findOverlappingEvents = async function(guildId, startDate, endDate, excludeEventId = null) {
  const query = {
    guildId,
    $or: [
      // New event starts during an existing event
      { startDate: { $lte: startDate }, endDate: { $gte: startDate } },
      // New event ends during an existing event
      { startDate: { $lte: endDate }, endDate: { $gte: endDate } },
      // New event completely contains an existing event
      { startDate: { $gte: startDate }, endDate: { $lte: endDate } }
    ]
  };

  if (excludeEventId) {
    query._id = { $ne: excludeEventId };
  }

  return this.find(query);
};

// Validate dates before saving
eventSchema.pre('save', function(next) {
  if (this.startDate >= this.endDate) {
    next(new Error('End date must be after start date'));
  }
  next();
});

export const Event = mongoose.model('Event', eventSchema); 