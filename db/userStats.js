import mongoose from 'mongoose';

const userStatsSchema = new mongoose.Schema({
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
  
  // Session Stats
  totalStudyTime: { 
    type: Number, 
    default: 0 
  },
  eventStudyTime: { 
    type: Number, 
    default: 0 
  },
  currentEventRole: { 
    type: String, 
    default: null 
  },
  totalSessions: { 
    type: Number, 
    default: 0 
  },
  sessionIds: [{ 
    type: String 
  }],
  
  // Study Days & Streaks
  studyDays: [{ 
    type: Date 
  }],
  currentStreak: { 
    type: Number, 
    default: 0 
  },
  longestStreak: { 
    type: Number, 
    default: 0 
  },
  
  // Task Stats
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

// Method to update session stats
userStatsSchema.methods.updateSessionStats = async function(session) {
  // Update total study time
  this.totalStudyTime += session.duration;
  
  // Update event study time if session was event-linked
  if (session.isEventLinked) {
    this.eventStudyTime += session.duration;
    this.currentEventRole = session.eventRole;
  }
  
  // Add session ID if not already present
  if (!this.sessionIds.includes(session._id.toString())) {
    this.sessionIds.push(session._id.toString());
    this.totalSessions += 1;
  }
  
  // Update study days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const lastStudyDay = this.studyDays.length > 0 
    ? new Date(this.studyDays[this.studyDays.length - 1])
    : null;
  
  if (!lastStudyDay || lastStudyDay.getTime() !== today.getTime()) {
    this.studyDays.push(today);
    
    // Update streaks
    if (lastStudyDay) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      if (lastStudyDay.getTime() === yesterday.getTime()) {
        // Consecutive day
        this.currentStreak += 1;
        if (this.currentStreak > this.longestStreak) {
          this.longestStreak = this.currentStreak;
        }
      } else {
        // Streak broken
        this.currentStreak = 1;
      }
    } else {
      // First study day
      this.currentStreak = 1;
      this.longestStreak = 1;
    }
  }
  
  this.lastUpdated = new Date();
  return this.save();
};

// Method to update task stats
userStatsSchema.methods.updateTaskStats = async function(action) {
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
  }
  
  this.lastUpdated = new Date();
  return this.save();
};

// Static method to find or create user stats
userStatsSchema.statics.findOrCreate = async function(userId, username) {
  let stats = await this.findOne({ userId });
  
  if (!stats) {
    stats = new this({
      userId,
      username
    });
    await stats.save();
  } else if (stats.username !== username) {
    // Update username if changed
    stats.username = username;
    await stats.save();
  }
  
  return stats;
};

export const UserStats = mongoose.model('UserStats', userStatsSchema); 