import mongoose from 'mongoose';

const timeLogSchema = new mongoose.Schema({
  start: { type: Date, required: true },
  end: { type: Date },
  voiceChannelId: { type: String, required: true }
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
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  timeLog: {
    type: [timeLogSchema],
    default: []
  }
}, {
  timestamps: true
});

// Add indexes for common queries
taskSchema.index({ status: 1 });
taskSchema.index({ category: 1 });
taskSchema.index({ priority: 1 });
taskSchema.index({ deadline: 1 });

export const Task = mongoose.model('Task', taskSchema); 