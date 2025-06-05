import { Event } from '../db/event.js';

/**
 * Checks if a user's event role is linked to an active event
 * @param {string} roleId - The event role ID to check
 * @param {string} guildId - The guild ID
 * @returns {Promise<{eventId: string} | null>} Event info if linked, null otherwise
 */
export async function checkEventLinkage(roleId, guildId) {
  try {
    // Find active events in the guild
    const activeEvent = await Event.findOne({
      guildId,
      status: 'active',
      targetRoles: roleId,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() }
    });

    if (!activeEvent) return null;

    return {
      eventId: activeEvent._id.toString()
    };
  } catch (error) {
    console.error('[EVENT LINKAGE] Error checking event linkage:', error);
    return null;
  }
} 