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
    default: Date.now
  },
  leaveTime: {
    type: Date
  },
  duration: {
    type: Number, // in seconds
    default: 0
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
  }
}, {
  timestamps: true
});

// Compound index for finding active sessions
sessionSchema.index({ userId: 1, guildId: 1, status: 1 });

// Method to calculate duration
sessionSchema.methods.calculateDuration = function() {
  if (this.leaveTime) {
    this.duration = Math.floor((this.leaveTime - this.joinTime) / 1000);
  }
  return this.duration;
};

// Method to complete a session
sessionSchema.methods.complete = async function() {
  this.leaveTime = new Date();
  this.calculateDuration();
  this.status = 'completed';
  return this.save();
};

// Method to cancel a session
sessionSchema.methods.cancel = async function() {
  this.leaveTime = new Date();
  this.calculateDuration();
  this.status = 'cancelled';
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

// Update duration before saving
sessionSchema.pre('save', function(next) {
  if (this.isModified('leaveTime')) {
    this.calculateDuration();
  }
  next();
});

export const Session = mongoose.model('Session', sessionSchema); 