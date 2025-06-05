import { Events } from 'discord.js';
import { stopTracking, getTracking } from '../utils/tracking.js';

export const name = Events.VoiceStateUpdate;
export const once = false;

/**
 * Handles voice state updates to stop tracking when a user leaves a voice channel.
 * @param {import('discord.js').VoiceState} oldState
 * @param {import('discord.js').VoiceState} newState
 */
export async function execute(oldState, newState) {
  try {
    const userId = oldState.id;
    // Only handle if the user left a voice channel
    if (oldState.channelId && !newState.channelId) {
      const session = stopTracking(userId);
      if (session) {
        try {
          const { Task } = await import('../db/task.js');
          const trackedTask = await Task.findById(session.taskId);
          if (trackedTask) {
            trackedTask.timeLog.push({
              start: session.start,
              end: session.end,
              voiceChannelId: session.voiceChannelId
            });
            await trackedTask.save();
            console.log(`[VOICE] User ${userId} left VC, session logged for task ${session.taskId}`);
          } else {
            console.error(`[VOICE] Could not find task ${session.taskId} to log session for user ${userId}`);
          }
        } catch (err) {
          console.error('[VOICE] Error logging session to task:', err, 'User:', userId);
        }
      }
    }
  } catch (error) {
    console.error('[VOICE] Error in voiceStateUpdate handler:', error);
  }
} 