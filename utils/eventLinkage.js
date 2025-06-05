import { Event } from '../db/event.js';

/**
 * Checks if a role is linked to an active event
 * @param {string} roleId - The role ID to check
 * @param {string} guildId - The guild ID
 * @returns {Promise<{eventId: string} | null>} - Returns event ID if linked, null otherwise
 */
export async function checkEventLinkage(roleId, guildId) {
  try {
    const now = new Date();
    
    // Find active events in the guild that:
    // 1. Have the specified role
    // 2. Are currently running (current time is between start and end)
    const event = await Event.findOne({
      guildId,
      targetRoles: roleId,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    if (event) {
      return {
        eventId: event._id
      };
    }

    return null;
  } catch (error) {
    console.error('[EVENT-LINKAGE] Error checking event linkage:', error);
    return null;
  }
} 