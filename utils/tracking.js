// In-memory map: userId -> { taskId, voiceChannelId, start }
const activeTracking = new Map();

/**
 * Start tracking a task for a user in a voice channel.
 * @param {string} userId
 * @param {string} taskId
 * @param {string} voiceChannelId
 */
export function startTracking(userId, taskId, voiceChannelId) {
  try {
    const start = new Date();
    activeTracking.set(userId, {
      taskId,
      voiceChannelId,
      start
    });
    console.log(`[TRACKING] Started tracking task ${taskId} for user ${userId} in VC ${voiceChannelId}
      Start Time: ${start.toISOString()}
      Task ID: ${taskId}
      Voice Channel: ${voiceChannelId}
    `);
  } catch (error) {
    console.error('[TRACKING] Error starting tracking:', error, 'User:', userId);
  }
}

/**
 * Stop tracking a task for a user. Returns session info or null.
 * @param {string} userId
 * @returns {{ taskId, voiceChannelId, start, end, duration } | null }
 */
export function stopTracking(userId) {
  try {
    const session = activeTracking.get(userId);
    if (!session) return null;
    
    const end = new Date();
    const duration = Math.floor((end - session.start) / 1000); // Duration in seconds
    
    activeTracking.delete(userId);
    console.log(`[TRACKING] Stopped tracking task ${session.taskId} for user ${userId}
      Start Time: ${session.start.toISOString()}
      End Time: ${end.toISOString()}
      Duration: ${duration}s
      Voice Channel: ${session.voiceChannelId}
    `);
    
    return { ...session, end, duration };
  } catch (error) {
    console.error('[TRACKING] Error stopping tracking:', error, 'User:', userId);
    return null;
  }
}

/**
 * Get the current tracking session for a user.
 * @param {string} userId
 * @returns {{ taskId, voiceChannelId, start } | undefined }
 */
export function getTracking(userId) {
  try {
    const session = activeTracking.get(userId);
    if (session) {
      console.log(`[TRACKING] Current tracking session for user ${userId}:
        Task ID: ${session.taskId}
        Voice Channel: ${session.voiceChannelId}
        Start Time: ${session.start.toISOString()}
        Duration: ${Math.floor((new Date() - session.start) / 1000)}s
      `);
    }
    return session;
  } catch (error) {
    console.error('[TRACKING] Error getting tracking:', error, 'User:', userId);
    return undefined;
  }
}

/**
 * Clear all tracking sessions (for shutdown/testing).
 */
export function clearAllTracking() {
  try {
    activeTracking.clear();
    console.log('[TRACKING] Cleared all tracking sessions');
  } catch (error) {
    console.error('[TRACKING] Error clearing all tracking:', error);
  }
} 