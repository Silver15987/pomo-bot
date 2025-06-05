import mongoose from 'mongoose';

const userTodoSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  activeTasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  completedTasks: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Task'
  }],
  preferences: {
    defaultSort: {
      type: String,
      enum: ['default', 'priority', 'deadline'],
      default: 'default'
    },
    defaultView: {
      type: String,
      enum: ['all', 'active', 'completed'],
      default: 'active'
    }
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

// Static method to find or create a user's todo list
userTodoSchema.statics.findOrCreate = async function(userId) {
  try {
    console.log(`[DB] Finding or creating UserTodo for ${userId}`);
    let userTodo = await this.findOne({ userId });
    if (!userTodo) {
      console.log(`[DB] Creating new UserTodo for ${userId}`);
      userTodo = new this({ userId });
      await userTodo.save();
      console.log(`[DB] Created new UserTodo for ${userId}`);
    } else {
      console.log(`[DB] Found existing UserTodo for ${userId}`);
    }
    return userTodo;
  } catch (error) {
    console.error(`[DB] Error in findOrCreate for ${userId}:`, error);
    throw error;
  }
};

// Method to add a task to active tasks
userTodoSchema.methods.addTask = async function(taskId) {
  if (!this.activeTasks.includes(taskId)) {
    this.activeTasks.push(taskId);
    await this.save();
  }
  return this;
};

// Method to complete a task
userTodoSchema.methods.completeTask = async function(taskId) {
  const taskIndex = this.activeTasks.indexOf(taskId);
  if (taskIndex > -1) {
    this.activeTasks.splice(taskIndex, 1);
    this.completedTasks.push(taskId);
    await this.save();
  }
  return this;
};

// Method to remove a task (for abandoned tasks)
userTodoSchema.methods.removeTask = async function(taskId) {
  const activeIndex = this.activeTasks.indexOf(taskId);
  if (activeIndex > -1) {
    this.activeTasks.splice(activeIndex, 1);
  }
  const completedIndex = this.completedTasks.indexOf(taskId);
  if (completedIndex > -1) {
    this.completedTasks.splice(completedIndex, 1);
  }
  await this.save();
  return this;
};

export const UserTodo = mongoose.model('UserTodo', userTodoSchema); 