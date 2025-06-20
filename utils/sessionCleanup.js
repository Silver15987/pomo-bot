import { cleanupStaleSessions } from './sessionManager.js';

/**
 * Periodic cleanup job for stale sessions
 * This should be run regularly (e.g., every hour) to clean up sessions
 * that were left open due to missed events, bot downtime, etc.
 */

let cleanupInterval = null;

/**
 * Start the periodic cleanup job
 * @param {number} intervalMinutes - How often to run cleanup (in minutes)
 * @param {number} maxAgeHours - Maximum age of active sessions before cleanup
 */
export function startSessionCleanup(intervalMinutes = 60, maxAgeHours = 12) {
  if (cleanupInterval) {
    console.log('[SESSION-CLEANUP] Cleanup job already running');
    return;
  }

  console.log(`[SESSION-CLEANUP] Starting periodic cleanup job:
    Interval: every ${intervalMinutes} minutes
    Max session age: ${maxAgeHours} hours
  `);

  // Run cleanup immediately on start
  runCleanup(maxAgeHours);

  // Set up periodic cleanup
  cleanupInterval = setInterval(() => {
    runCleanup(maxAgeHours);
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop the periodic cleanup job
 */
export function stopSessionCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[SESSION-CLEANUP] Stopped periodic cleanup job');
  }
}

/**
 * Run cleanup once
 * @param {number} maxAgeHours - Maximum age of active sessions before cleanup
 */
async function runCleanup(maxAgeHours = 12) {
  try {
    console.log(`[SESSION-CLEANUP] Running stale session cleanup (max age: ${maxAgeHours} hours)`);
    const cleanedCount = await cleanupStaleSessions(maxAgeHours);
    console.log(`[SESSION-CLEANUP] Cleanup completed: ${cleanedCount} sessions cleaned`);
  } catch (error) {
    console.error('[SESSION-CLEANUP] Error during cleanup:', error);
  }
}

/**
 * Manual cleanup trigger (can be called from commands or admin panel)
 * @param {number} maxAgeHours - Maximum age of active sessions before cleanup
 * @returns {Promise<number>} Number of sessions cleaned
 */
export async function manualCleanup(maxAgeHours = 12) {
  console.log(`[SESSION-CLEANUP] Manual cleanup triggered (max age: ${maxAgeHours} hours)`);
  return await cleanupStaleSessions(maxAgeHours);
}

// Export for use in other modules
export { runCleanup }; 