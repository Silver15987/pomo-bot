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
    activeTracking.set(userId, {
      taskId,
      voiceChannelId,
      start: new Date()
    });
    console.log(`[TRACKING] Started tracking task ${taskId} for user ${userId} in VC ${voiceChannelId}`);
  } catch (error) {
    console.error('[TRACKING] Error starting tracking:', error, 'User:', userId);
  }
}

/**
 * Stop tracking a task for a user. Returns session info or null.
 * @param {string} userId
 * @returns {{ taskId, voiceChannelId, start, end } | null }
 */
export function stopTracking(userId) {
  try {
    const session = activeTracking.get(userId);
    if (!session) return null;
    activeTracking.delete(userId);
    const end = new Date();
    console.log(`[TRACKING] Stopped tracking task ${session.taskId} for user ${userId} in VC ${session.voiceChannelId}`);
    return { ...session, end };
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
    return activeTracking.get(userId);
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