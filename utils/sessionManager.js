import { Session } from '../db/session.js';
import { UserStats } from '../db/userStats.js';
import { checkEventLinkage } from './eventLinkage.js';
import { Event } from '../db/event.js';

/**
 * Centralized session management utility
 * Handles all session creation, updates, and closing to prevent overlaps
 */

/**
 * Validates that times are valid dates and make sense
 * @param {Date} joinTime 
 * @param {Date} leaveTime 
 * @returns {boolean}
 */
function validateSessionTimes(joinTime, leaveTime = null) {
  try {
    // Check if joinTime is a valid date
    if (!joinTime || !(joinTime instanceof Date) || isNaN(joinTime.getTime())) {
      console.error('[SESSION-MANAGER] Invalid joinTime:', joinTime);
      return false;
    }

    // Check if joinTime is reasonable (not too far in past or future)
    const now = new Date();
    const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);

    if (joinTime < oneYearAgo || joinTime > oneHourFromNow) {
      console.error('[SESSION-MANAGER] joinTime out of reasonable range:', joinTime);
      return false;
    }

    // If leaveTime is provided, validate it too
    if (leaveTime) {
      if (!(leaveTime instanceof Date) || isNaN(leaveTime.getTime())) {
        console.error('[SESSION-MANAGER] Invalid leaveTime:', leaveTime);
        return false;
      }

      if (leaveTime <= joinTime) {
        console.error('[SESSION-MANAGER] leaveTime must be after joinTime:', { joinTime, leaveTime });
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error('[SESSION-MANAGER] Error validating session times:', error);
    return false;
  }
}

/**
 * Safely closes any existing active session for a user
 * @param {string} userId 
 * @param {string} guildId 
 * @param {Date} closeTime 
 * @param {string} reason 
 * @returns {Promise<Session|null>}
 */
async function closeExistingActiveSession(userId, guildId, closeTime = new Date(), reason = 'system_close') {
  try {
    const activeSession = await Session.findActiveSession(userId, guildId);
    
    if (!activeSession) {
      return null;
    }

    console.log(`[SESSION-MANAGER] Closing existing active session for user ${userId}:
      Session ID: ${activeSession._id}
      Join Time: ${activeSession.joinTime}
      Close Time: ${closeTime}
      Reason: ${reason}
    `);

    // Validate the close time
    if (!validateSessionTimes(activeSession.joinTime, closeTime)) {
      console.warn('[SESSION-MANAGER] Invalid close time, using current time');
      closeTime = new Date();
    }

    // Close the session
    activeSession.leaveTime = closeTime;
    activeSession.calculateDuration();
    activeSession.status = 'completed';
    activeSession.closureReason = reason;

    await activeSession.save();

    // Update user stats for the closed session
    const userStats = await UserStats.findOrCreate(userId, null); // No username available in this context
    await userStats.updateSessionStats(activeSession);

    console.log(`[SESSION-MANAGER] Successfully closed session ${activeSession._id} with duration ${activeSession.duration}s`);
    
    return activeSession;
  } catch (error) {
    console.error('[SESSION-MANAGER] Error closing existing active session:', error);
    return null;
  }
}

/**
 * Creates a new session with proper validation and overlap prevention
 * @param {string} userId 
 * @param {string} guildId 
 * @param {string} channelId 
 * @param {string} username 
 * @param {Object} member - Discord member object for event linking
 * @returns {Promise<Session|null>}
 */
async function createNewSession(userId, guildId, channelId, username, member = null) {
  try {
    const joinTime = new Date();

    // Validate inputs
    if (!userId || !guildId || !channelId) {
      console.error('[SESSION-MANAGER] Missing required parameters:', { userId, guildId, channelId });
      return null;
    }

    if (!validateSessionTimes(joinTime)) {
      console.error('[SESSION-MANAGER] Invalid join time');
      return null;
    }

    console.log(`[SESSION-MANAGER] Creating new session for user ${userId} (${username}) in channel ${channelId}`);

    // Close any existing active session first (prevents overlaps)
    await closeExistingActiveSession(userId, guildId, joinTime, 'new_session_overlap_prevention');

    // Create new session
    const session = new Session({
      userId,
      guildId,
      channelId,
      joinTime,
      status: 'active'
    });

    // Handle event linking if member is provided
    if (member) {
      try {
        // Get all active event role IDs
        const activeEventRoleIds = await getActiveEventRoleIds(guildId);
        
        // Check for event roles
        const eventRoles = member.roles.cache.filter(role => 
          activeEventRoleIds.includes(role.id)
        );

        if (eventRoles.size > 0) {
          const eventRole = eventRoles.first();
          session.eventRole = eventRole.id;
          
          // Check if this role is linked to an active event
          const eventLink = await checkEventLinkage(eventRole.id, guildId);
          if (eventLink) {
            session.isEventLinked = true;
            session.eventId = eventLink.eventId;
            console.log(`[SESSION-MANAGER] Linked session to event ${eventLink.eventId}`);
          }
        }
      } catch (error) {
        console.error('[SESSION-MANAGER] Error handling event linking:', error);
        // Continue without event linking
      }
    }

    await session.save();
    console.log(`[SESSION-MANAGER] Successfully created new session ${session._id} for user ${userId}`);

    return session;
  } catch (error) {
    console.error('[SESSION-MANAGER] Error creating new session:', error);
    return null;
  }
}

/**
 * Completes a session with proper validation and stats update
 * @param {string} userId 
 * @param {string} guildId 
 * @param {string} username 
 * @param {Date} leaveTime 
 * @returns {Promise<Session|null>}
 */
async function completeUserSession(userId, guildId, username, leaveTime = new Date()) {
  try {
    const session = await Session.findActiveSession(userId, guildId);
    
    if (!session) {
      console.log(`[SESSION-MANAGER] No active session found for user ${userId}`);
      return null;
    }

    console.log(`[SESSION-MANAGER] Completing session for user ${userId} (${username}):
      Session ID: ${session._id}
      Join Time: ${session.joinTime}
      Leave Time: ${leaveTime}
    `);

    // Validate the leave time
    if (!validateSessionTimes(session.joinTime, leaveTime)) {
      console.warn('[SESSION-MANAGER] Invalid leave time, using current time');
      leaveTime = new Date();
    }

    // Complete the session
    session.leaveTime = leaveTime;
    session.calculateDuration();
    session.status = 'completed';
    session.closureReason = 'user_left';

    await session.save();

    // Update user stats
    const userStats = await UserStats.findOrCreate(userId, username);
    await userStats.updateSessionStats(session);

    console.log(`[SESSION-MANAGER] Successfully completed session ${session._id} with duration ${session.duration}s`);
    
    return session;
  } catch (error) {
    console.error('[SESSION-MANAGER] Error completing session:', error);
    return null;
  }
}

/**
 * Handles user moving between channels (closes old, creates new)
 * @param {string} userId 
 * @param {string} guildId 
 * @param {string} newChannelId 
 * @param {string} username 
 * @param {Object} member - Discord member object
 * @returns {Promise<{oldSession: Session|null, newSession: Session|null}>}
 */
async function handleChannelMove(userId, guildId, newChannelId, username, member = null) {
  try {
    const moveTime = new Date();
    
    console.log(`[SESSION-MANAGER] Handling channel move for user ${userId} to channel ${newChannelId}`);

    // Close the old session
    const oldSession = await closeExistingActiveSession(userId, guildId, moveTime, 'channel_move');

    // Create new session for the new channel
    const newSession = await createNewSession(userId, guildId, newChannelId, username, member);

    return { oldSession, newSession };
  } catch (error) {
    console.error('[SESSION-MANAGER] Error handling channel move:', error);
    return { oldSession: null, newSession: null };
  }
}

/**
 * Cleanup stale sessions (for periodic cleanup job)
 * @param {number} maxAgeHours - Maximum age in hours for an active session
 * @returns {Promise<number>} - Number of sessions cleaned up
 */
async function cleanupStaleSessions(maxAgeHours = 12) {
  try {
    const cutoffTime = new Date(Date.now() - (maxAgeHours * 60 * 60 * 1000));
    
    console.log(`[SESSION-MANAGER] Cleaning up stale sessions older than ${maxAgeHours} hours (before ${cutoffTime})`);

    const staleSessions = await Session.find({
      status: 'active',
      joinTime: { $lt: cutoffTime }
    });

    let cleanedCount = 0;

    for (const session of staleSessions) {
      try {
        console.log(`[SESSION-MANAGER] Cleaning up stale session ${session._id} for user ${session.userId}`);
        
        session.leaveTime = cutoffTime;
        session.calculateDuration();
        session.status = 'cancelled';
        session.closureReason = 'system_cleanup';
        
        await session.save();

        // Update user stats (we don't have username here, so use 'unknown')
        const userStats = await UserStats.findOrCreate(session.userId, 'unknown');
        await userStats.updateSessionStats(session);

        cleanedCount++;
      } catch (error) {
        console.error(`[SESSION-MANAGER] Error cleaning up session ${session._id}:`, error);
      }
    }

    console.log(`[SESSION-MANAGER] Cleaned up ${cleanedCount} stale sessions`);
    return cleanedCount;
  } catch (error) {
    console.error('[SESSION-MANAGER] Error during cleanup:', error);
    return 0;
  }
}

/**
 * Gets all active event role IDs for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<string[]>} Array of role IDs
 */
async function getActiveEventRoleIds(guildId) {
  try {
    const now = new Date();
    const activeEvents = await Event.find({
      guildId,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });
    
    // Flatten all target roles from active events
    return activeEvents.flatMap(event => event.targetRoles);
  } catch (error) {
    console.error('[SESSION-MANAGER] Error getting active event role IDs:', error);
    return [];
  }
}

export {
  createNewSession,
  completeUserSession,
  handleChannelMove,
  closeExistingActiveSession,
  cleanupStaleSessions,
  validateSessionTimes
}; 