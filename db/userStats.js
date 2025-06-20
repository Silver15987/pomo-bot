import mongoose from 'mongoose';

const userStatsSchema = new mongoose.Schema({
  // Basic User Info
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  username: {
    type: String,
    required: true
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },

  // Session Statistics
  totalStudyTime: {
    type: Number, // in seconds
    default: 0
  },
  eventStudyTime: {
    type: Number, // in seconds
    default: 0
  },
  currentEventRole: {
    type: String
  },
  totalSessions: {
    type: Number,
    default: 0
  },
  sessionIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Session'
  }],

  // Study Days and Streaks
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastStudyDay: {
    type: Date
  },
  studyDays: [{
    type: Date
  }],

  // Task Statistics
  totalTasks: {
    type: Number,
    default: 0
  },
  completedTasks: {
    type: Number,
    default: 0
  },
  abandonedTasks: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Index for efficient querying
userStatsSchema.index({ userId: 1, lastStudyDay: -1 });

// Static method to find or create user stats
userStatsSchema.statics.findOrCreate = async function(userId, username) {
  let stats = await this.findOne({ userId });
  
  if (!stats) {
    stats = new this({
      userId,
      username
    });
    await stats.save();
  }
  
  return stats;
};

// Method to update last study day
userStatsSchema.methods.updateStudyDay = function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // If we already have a study day for today, don't add it again
  const hasToday = this.studyDays.some(day => {
    const studyDay = new Date(day);
    studyDay.setHours(0, 0, 0, 0);
    return studyDay.getTime() === today.getTime();
  });

  if (!hasToday) {
    this.studyDays.push(today);
    this.lastStudyDay = today;
  }

  return this.save();
};

// Method to update streaks
userStatsSchema.methods.updateStreaks = function() {
  if (!this.lastStudyDay) return this.save();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const lastDay = new Date(this.lastStudyDay);
  lastDay.setHours(0, 0, 0, 0);

  // If last study day was yesterday, increment streak
  const oneDay = 24 * 60 * 60 * 1000;
  if (today.getTime() - lastDay.getTime() === oneDay) {
    this.currentStreak += 1;
    if (this.currentStreak > this.longestStreak) {
      this.longestStreak = this.currentStreak;
    }
  } 
  // If last study day was before yesterday, reset streak
  else if (today.getTime() - lastDay.getTime() > oneDay) {
    this.currentStreak = 1;
  }

  return this.save();
};

// Method to update stats when a session completes
userStatsSchema.methods.updateSessionStats = async function(session) {
  // Validate session object
  if (!session || !session._id) {
    console.error('[USER-STATS] Invalid session object provided');
    return this;
  }

  // Validate session duration
  const duration = Math.max(0, session.duration || 0);
  if (duration === 0) {
    console.warn(`[USER-STATS] Session ${session._id} has zero duration, skipping stats update`);
    return this;
  }

  // Prevent duplicate session updates
  if (this.sessionIds.includes(session._id)) {
    console.warn(`[USER-STATS] Session ${session._id} already processed for user ${this.userId}`);
    return this;
  }

  console.log(`[USER-STATS] Updating stats for user ${this.userId} (${this.username})`);
  console.log(`[USER-STATS] Current stats before update:
    Total Study Time: ${this.totalStudyTime}s
    Event Study Time: ${this.eventStudyTime}s
    Total Sessions: ${this.totalSessions}
    Current Streak: ${this.currentStreak}
    Longest Streak: ${this.longestStreak}
    Last Study Day: ${this.lastStudyDay}
    Study Days Count: ${this.studyDays.length}
  `);
  
  try {
    // Update total study time (ensure it doesn't go negative)
    this.totalStudyTime = Math.max(0, this.totalStudyTime + duration);
    
    // Update event study time if session was event-linked
    if (session.isEventLinked) {
      this.eventStudyTime = Math.max(0, this.eventStudyTime + duration);
      this.currentEventRole = session.eventRole;
    }
    
    // Add session ID and increment count
    this.sessionIds.push(session._id);
    this.totalSessions += 1;
    
    // Update study day and streaks only if duration is meaningful (at least 60 seconds)
    if (duration >= 60) {
      await this.updateStudyDay();
      await this.updateStreaks();
    }
    
    // Update last updated timestamp
    this.lastUpdated = new Date();
    
    await this.save();
    
    console.log(`[USER-STATS] Stats updated for user ${this.userId}:
      New Total Study Time: ${this.totalStudyTime}s
      New Event Study Time: ${this.eventStudyTime}s
      New Total Sessions: ${this.totalSessions}
      New Current Streak: ${this.currentStreak}
      New Longest Streak: ${this.longestStreak}
      New Last Study Day: ${this.lastStudyDay}
      New Study Days Count: ${this.studyDays.length}
      Session Duration: ${duration}s
      Event Linked: ${session.isEventLinked}
      Event Role: ${session.eventRole || 'None'}
      Closure Reason: ${session.closureReason || 'unknown'}
    `);
    
    return this;
  } catch (error) {
    console.error(`[USER-STATS] Error updating stats for user ${this.userId}:`, error);
    return this;
  }
};

// Method to update task statistics
userStatsSchema.methods.updateTaskStats = async function(action, taskId) {
  console.log(`[USER-STATS] Updating task stats for user ${this.userId} (${this.username})`);
  console.log(`[USER-STATS] Current task stats before update:
    Total Tasks: ${this.totalTasks}
    Completed Tasks: ${this.completedTasks}
    Abandoned Tasks: ${this.abandonedTasks}
  `);

  switch (action) {
    case 'create':
      this.totalTasks += 1;
      break;
    case 'complete':
      this.completedTasks += 1;
      break;
    case 'abandon':
      this.abandonedTasks += 1;
      break;
    default:
      console.error(`[USER-STATS] Unknown task action: ${action}`);
      return this;
  }

  this.lastUpdated = new Date();
  await this.save();

  console.log(`[USER-STATS] Task stats updated for user ${this.userId}:
    New Total Tasks: ${this.totalTasks}
    New Completed Tasks: ${this.completedTasks}
    New Abandoned Tasks: ${this.abandonedTasks}
    Action: ${action}
    Task ID: ${taskId}
  `);

  return this;
};

export const UserStats = mongoose.model('UserStats', userStatsSchema); 