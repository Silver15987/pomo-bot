import { Events } from 'discord.js';
import { Session } from '../db/session.js';
import { UserStats } from '../db/userStats.js';
import { checkEventLinkage } from '../utils/eventLinkage.js';
import { Event } from '../db/event.js';
import { stopTracking } from '../utils/tracking.js';
import { Task } from '../db/task.js';
import { 
  createNewSession, 
  completeUserSession, 
  handleChannelMove 
} from '../utils/sessionManager.js';

export const name = Events.VoiceStateUpdate;
export const once = false;

/**
 * Gets all active event role IDs for a guild
 * @param {string} guildId - The guild ID
 * @returns {Promise<string[]>} Array of role IDs
 */
async function getActiveEventRoleIds(guildId) {
  const now = new Date();
  const activeEvents = await Event.find({
    guildId,
    startDate: { $lte: now },
    endDate: { $gte: now }
  });
  
  // Flatten all target roles from active events
  return activeEvents.flatMap(event => event.targetRoles);
}

/**
 * Handles voice state updates to track VC sessions
 * @param {import('discord.js').VoiceState} oldState
 * @param {import('discord.js').VoiceState} newState
 */
export async function execute(oldState, newState) {
  try {
    // Check if member exists (can be null for bots or in certain edge cases)
    if (!newState.member && !oldState.member) {
      console.log('[VOICE] Skipping voice state update - no member found');
      return;
    }

    // User joined a VC
    if (!oldState.channelId && newState.channelId) {
      if (!newState.member || !newState.member.user) {
        console.log('[VOICE] Skipping join event - invalid member or user');
        return;
      }
      
      console.log(`[VOICE] User ${newState.member.user.tag} joined channel ${newState.channel.name}`);
      
      // Use centralized session manager to create new session
      const session = await createNewSession(
        newState.member.id,
        newState.guild.id,
        newState.channelId,
        newState.member.user.tag,
        newState.member
      );

      if (session) {
        console.log(`[VOICE] Successfully created session ${session._id} for ${newState.member.user.tag}`);
      } else {
        console.error(`[VOICE] Failed to create session for ${newState.member.user.tag}`);
      }
    }

    // User left a VC
    if (oldState.channelId && !newState.channelId) {
      if (!oldState.member || !oldState.member.user) {
        console.log('[VOICE] Skipping leave event - invalid member or user');
        return;
      }
      
      console.log(`[VOICE] User ${oldState.member.user.tag} left channel ${oldState.channel.name}`);
      
      // Stop task tracking if active
      const trackingSession = stopTracking(oldState.member.id);
      if (trackingSession) {
        console.log(`[VOICE] Stopped task tracking for ${oldState.member.user.tag}`);
        
        // Update task time spent
        const task = await Task.findById(trackingSession.taskId);
        if (task) {
          await task.updateTimeSpent(trackingSession);
          console.log(`[VOICE] Updated time spent for task ${task.title}`);
        }
      }
      
      // Use centralized session manager to complete session
      const session = await completeUserSession(
        oldState.member.id,
        oldState.guild.id,
        oldState.member.user.tag
      );

      if (session) {
        console.log(`[VOICE] Successfully completed session ${session._id} for ${oldState.member.user.tag} with duration ${session.duration}s`);
      } else {
        console.log(`[VOICE] No active session found to complete for ${oldState.member.user.tag}`);
      }
    }

    // User moved between VCs
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      if (!newState.member || !newState.member.user || !oldState.member || !oldState.member.user) {
        console.log('[VOICE] Skipping move event - invalid member or user');
        return;
      }
      
      console.log(`[VOICE] User ${oldState.member.user.tag} moved from ${oldState.channel.name} to ${newState.channel.name}`);
      
      // Stop task tracking if active
      const trackingSession = stopTracking(oldState.member.id);
      if (trackingSession) {
        console.log(`[VOICE] Stopped task tracking for ${oldState.member.user.tag} during channel move`);
        
        // Update task time spent
        const task = await Task.findById(trackingSession.taskId);
        if (task) {
          await task.updateTimeSpent(trackingSession);
          console.log(`[VOICE] Updated time spent for task ${task.title}`);
        }
      }
      
      // Use centralized session manager to handle channel move
      const { oldSession, newSession } = await handleChannelMove(
        newState.member.id,
        newState.guild.id,
        newState.channelId,
        newState.member.user.tag,
        newState.member
      );

      if (oldSession && newSession) {
        console.log(`[VOICE] Successfully handled channel move for ${newState.member.user.tag}:
          Old session ${oldSession._id}: ${oldSession.duration}s
          New session ${newSession._id}: started
        `);
      } else {
        console.error(`[VOICE] Failed to handle channel move for ${newState.member.user.tag}`);
      }
    }
  } catch (error) {
    console.error('[VOICE] Error in voice state update:', error);
  }
} 