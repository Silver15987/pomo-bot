import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  guildId: {
    type: String,
    required: true,
    index: true
  },
  channelId: {
    type: String,
    required: true
  },
  joinTime: {
    type: Date,
    required: true,
    default: Date.now,
    validate: {
      validator: function(v) {
        // Validate that joinTime is a reasonable date (not too far in past or future)
        const now = new Date();
        const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
        const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        return v >= oneYearAgo && v <= oneHourFromNow;
      },
      message: 'joinTime must be within the last year and not more than 1 hour in the future'
    }
  },
  leaveTime: {
    type: Date,
    validate: {
      validator: function(v) {
        // If leaveTime exists, it must be after joinTime
        return !v || v > this.joinTime;
      },
      message: 'leaveTime must be after joinTime'
    }
  },
  duration: {
    type: Number, // in seconds
    default: 0,
    min: [0, 'Duration cannot be negative']
  },
  isEventLinked: {
    type: Boolean,
    default: false
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  },
  eventRole: {
    type: String
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'cancelled'],
    default: 'active'
  },
  closureReason: {
    type: String,
    enum: ['user_left', 'channel_move', 'system_cleanup', 'overlap_fix', 'new_session_overlap_prevention', 'system_close', null],
    default: null
  }
}, {
  timestamps: true
});

// Compound index for finding active sessions
sessionSchema.index({ userId: 1, guildId: 1, status: 1 });

// Unique constraint to prevent multiple active sessions per user/guild
// This uses a partial filter expression to only apply the unique constraint when status is 'active'
sessionSchema.index(
  { userId: 1, guildId: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: 'active' },
    name: 'unique_active_session_per_user_guild'
  }
);

// Method to calculate duration
sessionSchema.methods.calculateDuration = function() {
  if (this.leaveTime && this.joinTime) {
    const duration = Math.floor((this.leaveTime - this.joinTime) / 1000);
    this.duration = Math.max(0, duration); // Ensure duration is never negative
  }
  return this.duration;
};

// Method to complete a session
sessionSchema.methods.complete = async function() {
  this.leaveTime = new Date();
  this.calculateDuration();
  this.status = 'completed';
  if (!this.closureReason) {
    this.closureReason = 'user_left';
  }
  return this.save();
};

// Method to cancel a session
sessionSchema.methods.cancel = async function() {
  this.leaveTime = new Date();
  this.calculateDuration();
  this.status = 'cancelled';
  if (!this.closureReason) {
    this.closureReason = 'system_cleanup';
  }
  return this.save();
};

// Static method to find active session
sessionSchema.statics.findActiveSession = async function(userId, guildId) {
  return this.findOne({
    userId,
    guildId,
    status: 'active'
  });
};

// Static method to safely close any existing active session and create a new one
sessionSchema.statics.createNewSessionSafely = async function(sessionData) {
  const { userId, guildId, channelId } = sessionData;
  
  try {
    // First, find and close any existing active session
    const existingSession = await this.findActiveSession(userId, guildId);
    if (existingSession) {
      existingSession.leaveTime = sessionData.joinTime || new Date();
      existingSession.calculateDuration();
      existingSession.status = 'completed';
      existingSession.closureReason = 'new_session_overlap_prevention';
      await existingSession.save();
      console.log(`[SESSION] Closed existing session ${existingSession._id} to prevent overlap`);
    }
    
    // Create new session
    const newSession = new this(sessionData);
    await newSession.save();
    return newSession;
  } catch (error) {
    console.error('[SESSION] Error in createNewSessionSafely:', error);
    throw error;
  }
};

// Update duration before saving
sessionSchema.pre('save', function(next) {
  if (this.isModified('leaveTime') && this.leaveTime) {
    this.calculateDuration();
  }
  next();
});

// Validation before saving to ensure data integrity
sessionSchema.pre('save', function(next) {
  // Ensure joinTime is valid
  if (!this.joinTime || isNaN(this.joinTime.getTime())) {
    return next(new Error('Invalid joinTime'));
  }
  
  // If leaveTime exists, ensure it's valid and after joinTime
  if (this.leaveTime) {
    if (isNaN(this.leaveTime.getTime())) {
      return next(new Error('Invalid leaveTime'));
    }
    if (this.leaveTime <= this.joinTime) {
      return next(new Error('leaveTime must be after joinTime'));
    }
  }
  
  // Ensure duration is non-negative
  if (this.duration < 0) {
    this.duration = 0;
  }
  
  next();
});

export const Session = mongoose.model('Session', sessionSchema); 