import mongoose from 'mongoose';

const timeLogSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date },
  voiceChannelId: { type: String, required: true },
  duration: { type: Number, default: 0 } // Duration in seconds
}, { _id: false });

const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    enum: ['Study', 'Work', 'Personal', 'Other'],
    default: 'Other'
  },
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  status: {
    type: String,
    enum: ['active', 'completed', 'held', 'abandoned'],
    default: 'active'
  },
  deadline: {
    type: Date,
    default: null
  },
  totalTimeSpent: {
    type: Number,
    default: 0 // Total time spent in seconds
  },
  timeLog: {
    type: [timeLogSchema],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Add indexes for common queries
taskSchema.index({ status: 1 });
taskSchema.index({ userId: 1, status: 1 });

// Add method to update time spent
taskSchema.methods.updateTimeSpent = async function(session) {
  try {
    const duration = Math.floor((session.end - session.start) / 1000); // Convert to seconds
    this.totalTimeSpent += duration;
    this.timeLog.push({
      start: session.start,
      end: session.end,
      voiceChannelId: session.voiceChannelId,
      duration
    });
    await this.save();
    console.log(`[TASK] Updated time spent for task ${this._id}: +${duration}s (Total: ${this.totalTimeSpent}s)`);
  } catch (error) {
    console.error(`[TASK] Error updating time spent for task ${this._id}:`, error);
  }
};

export const Task = mongoose.model('Task', taskSchema); 