import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  discordId: {
    type: String,
    required: true,
    unique: true
  },
  username: String,
  joinedAt: Date,
  remindersEnabled: { type: Boolean, default: true },
  // Add more fields as needed (e.g., pomodoro stats, tasks, etc.)
});

export const User = mongoose.model('User', userSchema); 