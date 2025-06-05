import { Event } from '../db/event.js';

/**
 * Debug function to show all active events and their roles
 * @param {string} guildId - The guild ID to check
 */
export async function debugActiveEvents(guildId) {
  try {
    const now = new Date();
    console.log(`\n[EVENT-DEBUG] Checking active events in guild ${guildId} at ${now.toISOString()}`);
    
    const activeEvents = await Event.find({
      guildId,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });

    if (activeEvents.length === 0) {
      console.log('[EVENT-DEBUG] No active events found');
      return;
    }

    console.log(`[EVENT-DEBUG] Found ${activeEvents.length} active event(s):`);
    activeEvents.forEach(event => {
      console.log(`
Event: ${event.name}
ID: ${event._id}
Start: ${event.startDate.toISOString()}
End: ${event.endDate.toISOString()}
Roles: ${event.targetRoles.join(', ')}
-------------------`);
    });
  } catch (error) {
    console.error('[EVENT-DEBUG] Error checking active events:', error);
  }
}

/**
 * Checks if a role is linked to an active event
 * @param {string} roleId - The role ID to check
 * @param {string} guildId - The guild ID
 * @returns {Promise<{eventId: string} | null>} - Returns event ID if linked, null otherwise
 */
export async function checkEventLinkage(roleId, guildId) {
  try {
    const now = new Date();
    console.log(`[EVENT-LINKAGE] Checking event linkage for role ${roleId} in guild ${guildId}`);
    console.log(`[EVENT-LINKAGE] Current time: ${now.toISOString()}`);
    
    // First, let's log all current events in the guild
    const currentEvents = await Event.find({
      guildId,
      startDate: { $lte: now },
      endDate: { $gte: now }
    });
    
    console.log(`[EVENT-LINKAGE] Current active events in guild:
      ${currentEvents.length > 0 ? currentEvents.map(e => `
        Event: ${e.name}
        ID: ${e._id}
        Start: ${e.startDate.toISOString()}
        End: ${e.endDate.toISOString()}
        Roles: ${e.targetRoles.join(', ')}
      `).join('\n') : 'No active events found'}
    `);
    
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
      console.log(`[EVENT-LINKAGE] Found matching active event:
        Event ID: ${event._id}
        Name: ${event.name}
        Start Date: ${event.startDate.toISOString()}
        End Date: ${event.endDate.toISOString()}
        Target Roles: ${event.targetRoles.join(', ')}
      `);
      return {
        eventId: event._id
      };
    }

    console.log(`[EVENT-LINKAGE] No active event found for role ${roleId}`);
    return null;
  } catch (error) {
    console.error('[EVENT-LINKAGE] Error checking event linkage:', error);
    return null;
  }
} 