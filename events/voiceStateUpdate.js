import { Events } from 'discord.js';
import { Session } from '../db/session.js';
import { UserStats } from '../db/userStats.js';
import { checkEventLinkage } from '../utils/eventLinkage.js';

export const name = Events.VoiceStateUpdate;
export const once = false;

/**
 * Handles voice state updates to track VC sessions
 * @param {import('discord.js').VoiceState} oldState
 * @param {import('discord.js').VoiceState} newState
 */
export async function execute(oldState, newState) {
  try {
    // User joined a VC
    if (!oldState.channelId && newState.channelId) {
      console.log(`[VOICE] User ${newState.member.user.tag} joined channel ${newState.channel.name}`);
      
      // Create new session
      const session = new Session({
        userId: newState.member.id,
        guildId: newState.guild.id,
        channelId: newState.channelId,
        joinTime: new Date()
      });

      // Check for event roles
      const member = newState.member;
      const eventRoles = member.roles.cache.filter(role => 
        role.name.toLowerCase().includes('event')
      );

      if (eventRoles.size > 0) {
        // Get the first event role (since user can only have one)
        const eventRole = eventRoles.first();
        session.eventRole = eventRole.id;
        
        // Check if this role is linked to an active event
        const eventLink = await checkEventLinkage(eventRole.id, newState.guild.id);
        if (eventLink) {
          session.isEventLinked = true;
          session.eventId = eventLink.eventId;
          console.log(`[VOICE] Linked session to event ${eventLink.eventId} for ${newState.member.user.tag}`);
        }
      }

      await session.save();
      console.log(`[VOICE] Created new session for ${newState.member.user.tag}`);
    }

    // User left a VC
    if (oldState.channelId && !newState.channelId) {
      console.log(`[VOICE] User ${oldState.member.user.tag} left channel ${oldState.channel.name}`);
      
      const session = await Session.findActiveSession(oldState.member.id, oldState.guild.id);
      if (!session) return;

      await session.complete();
      console.log(`[VOICE] Completed session for ${oldState.member.user.tag} with duration ${session.duration}s`);

      // Update user stats
      const userStats = await UserStats.findOrCreate(oldState.member.id, oldState.member.user.tag);
      await userStats.updateSessionStats(session);
      console.log(`[VOICE] Updated stats for ${oldState.member.user.tag}`);
    }

    // User moved between VCs
    if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
      console.log(`[VOICE] User ${oldState.member.user.tag} moved from ${oldState.channel.name} to ${newState.channel.name}`);
      
      // Complete old session
      const oldSession = await Session.findActiveSession(oldState.member.id, oldState.guild.id);
      if (oldSession) {
        await oldSession.complete();
        
        // Update user stats for old session
        const userStats = await UserStats.findOrCreate(oldState.member.id, oldState.member.user.tag);
        await userStats.updateSessionStats(oldSession);
        console.log(`[VOICE] Updated stats for ${oldState.member.user.tag} (old session)`);
      }

      // Create new session
      const newSession = new Session({
        userId: newState.member.id,
        guildId: newState.guild.id,
        channelId: newState.channelId,
        joinTime: new Date()
      });

      // Check for event roles in new session
      const member = newState.member;
      const eventRoles = member.roles.cache.filter(role => 
        role.name.toLowerCase().includes('event')
      );

      if (eventRoles.size > 0) {
        const eventRole = eventRoles.first();
        newSession.eventRole = eventRole.id;
        
        // Check if this role is linked to an active event
        const eventLink = await checkEventLinkage(eventRole.id, newState.guild.id);
        if (eventLink) {
          newSession.isEventLinked = true;
          newSession.eventId = eventLink.eventId;
          console.log(`[VOICE] Linked session to event ${eventLink.eventId} for ${newState.member.user.tag}`);
        }
      }

      await newSession.save();
      console.log(`[VOICE] Created new session for ${newState.member.user.tag} after channel move`);
    }
  } catch (error) {
    console.error('[VOICE] Error in voice state update:', error);
  }
} 