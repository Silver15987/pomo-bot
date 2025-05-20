// sessionState.js

// Shared session-level memory across handlers
const pendingTasks = new Map(); // userId -> { message, timeout }

module.exports = { pendingTasks };
