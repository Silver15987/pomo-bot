import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  guildId: { type: String, required: true },
  channelId: { type: String, required: true },
  joinTime: { type: Date, required: true },
  leaveTime: { type: Date },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' }, // Optional, if tracking a task
  // TODO: Add more fields as needed (device, session type, etc.)
}, {
  timestamps: true
});

export const Session = mongoose.model('Session', sessionSchema); 