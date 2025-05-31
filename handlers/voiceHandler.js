const { disallowedVoiceChannels, testMode } = require('../config/channel-config.json');
const { updateUserStats } = require('../db/userStats');
const { updateCurrentStats } = require('../db/userCurrentStats');
const { isWithinEventWindow, shouldIgnoreChannel } = require('../utils/eventUtils');
const { getUserActiveTask, abandonTask, updateTaskDuration, getInterruptedTasks } = require('../db/tasks');
const { pendingTasks } = require('../sessionState');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const { followupTimeoutMs } = require('../config/bot-config.json');
const { teamRoles } = require('../config/event-config.json');
const { logger } = require('../utils/logger');

const activeVoiceUsers = new Map();
const userStartTimes = new Map();
const submittedTaskUsers = new Set();

function markSubmitted(userId) {
    submittedTaskUsers.add(userId);
}

function getActiveVC(userId) {
    return activeVoiceUsers.get(userId);
}

function setupVoiceHandler(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const memberId = newState.id;
        const user = newState.member.user;

        // Handle user joining a voice channel
        if (!oldState.channelId && newState.channelId) {
            // Test mode check - if enabled, only allow the specified channels
            if (testMode.enabled && !testMode.allowedChannels.includes(newState.channelId)) {
                console.log(`[DEBUG] Test mode: User ${user.username} tried to join non-allowed VC ${newState.channelId}`);
                return;
            }
            
            // Regular disallowed check
            if (disallowedVoiceChannels.includes(newState.channelId)) {
                console.log(`[DEBUG] User ${user.username} joined disallowed VC ${newState.channelId}`);
                return;
            }

            console.log(`[DEBUG] ====== SETUP: USER JOINED VC ======`);
            console.log(`[DEBUG] User: ${user.username} (${memberId})`);
            console.log(`[DEBUG] Channel: ${newState.channelId}`);
            
            activeVoiceUsers.set(memberId, newState.channelId);
            const joinTime = new Date();
            userStartTimes.set(memberId, joinTime);
            console.log(`[DEBUG] Set start time: ${joinTime.toISOString()}`);
            
            console.log(`[DEBUG] ====== END SETUP JOIN EVENT ======`);
            return;
        }

        // Handle user leaving a voice channel
        if (oldState.channelId && !newState.channelId) {
            // Test mode check - if enabled, only process the specified channels
            if (testMode.enabled && !testMode.allowedChannels.includes(oldState.channelId)) {
                console.log(`[DEBUG] Test mode: User ${user.username} left non-allowed VC ${oldState.channelId}`);
                return;
            }

            // Regular disallowed check
            if (disallowedVoiceChannels.includes(oldState.channelId)) {
                console.log(`[DEBUG] User ${user.username} left disallowed VC ${oldState.channelId}`);
                return;
            }

            console.log(`[DEBUG] ====== SETUP: USER LEFT VC ======`);
            console.log(`[DEBUG] User: ${user.username} (${memberId})`);
            console.log(`[DEBUG] Left channel: ${oldState.channelId}`);

            const duration = Math.floor((Date.now() - oldState.joinedTimestamp) / 1000 / 60);
            console.log(`[DEBUG] Duration in VC: ${duration} minutes`);
            
            activeVoiceUsers.delete(memberId);
            const startTime = userStartTimes.get(memberId);
            userStartTimes.delete(memberId);

            if (!startTime) {
                console.log(`[DEBUG] WARNING: No start time found for ${user.username}`);
                return;
            }

            const endTime = new Date();
            const durationMs = endTime - startTime;
            const minutes = Math.floor(durationMs / (1000 * 60));
            
            console.log(`[DEBUG] Time tracking details:`);
            console.log(`[DEBUG] - Start time: ${startTime.toISOString()}`);
            console.log(`[DEBUG] - End time: ${endTime.toISOString()}`);
            console.log(`[DEBUG] - Raw duration (ms): ${durationMs}`);
            console.log(`[DEBUG] - Duration (minutes): ${minutes}`);
            console.log(`[DEBUG] - Duration (hours): ${(minutes / 60).toFixed(4)}`);

            const pending = pendingTasks.get(memberId);
            if (pending?.message) {
                try {
                    const row = ActionRowBuilder.from(pending.message.components[0]);
                    row.components = row.components.map(button =>
                        ButtonBuilder.from(button).setDisabled(true)
                    );

                    await pending.message.edit({
                        components: [row],
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("Session Cancelled")
                                .setDescription("You left the VC before submitting a task. The session has been cancelled.")
                                .setColor(0xff9900)
                        ]
                    });
                } catch (err) {
                    logger.logError(err, {
                        userId: memberId,
                        username: user.username,
                        action: 'disable_task_dm'
                    });
                }
            }

            let activeTask;
            try {
                activeTask = await getUserActiveTask(memberId);
            } catch (err) {
                logger.logError(err, {
                    userId: memberId,
                    username: user.username,
                    action: 'fetch_active_task'
                });
                return;
            }

            if (!activeTask) {
                console.log(`[DEBUG] No active task found for ${user.username}`);
                logger.logSystem('User left VC with no active task', {
                    userId: memberId,
                    username: user.username
                });
                return;
            }

            if (activeTask.kickedByBot) {
                console.log(`[DEBUG] Task was kicked by bot, marking as abandoned`);
                await abandonTask(memberId);
                logger.logTaskAbandon(
                    memberId,
                    user.username,
                    activeTask._id,
                    activeTask.task,
                    0
                );
                return;
            }

            submittedTaskUsers.delete(memberId);
            const eventLinked = isWithinEventWindow() && !shouldIgnoreChannel(oldState.channelId);
            console.log(`[DEBUG] Event status: ${eventLinked ? 'Event time' : 'Not event time'}`);

            // Update task with actual duration
            console.log(`[DEBUG] Updating task duration: ${minutes} minutes`);
            await updateTaskDuration(memberId, minutes);

            // Get user's team role
            const guild = client.guilds.cache.get(oldState.guild.id);
            const member = await guild.members.fetch(memberId);
            
            // Find the first team role the user has
            const teamRoleObj = member.roles.cache.find(role => teamRoles.includes(role.id));
            const teamRole = teamRoleObj ? {
                id: teamRoleObj.id,
                name: teamRoleObj.name
            } : null;

            if (teamRole) {
                console.log(`[DEBUG] Team role: ${teamRole.name} (${teamRole.id})`);
            }

            const hours = Math.floor(minutes / 60);
            const remainingMinutes = minutes % 60;
            const timeString = hours > 0 ? `${hours}h ${remainingMinutes}m` : `${remainingMinutes}m`;

            console.log(`[DEBUG] Formatted time string: ${timeString}`);

            logger.logVCLeave(
                memberId,
                user.username,
                oldState.channelId,
                oldState.channel.name,
                minutes
            );

            setTimeout(async () => {
                try {
                    const msg = await user.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("Task Interrupted")
                                .setDescription(`You spent ${timeString} on your task:\n\n**${activeTask.task}**\n\nDid you complete this task?`)
                                .setColor(0x00b0f4)
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('task_complete')
                                    .setLabel("Yes, completed")
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId('task_abandon')
                                    .setLabel("Abandon")
                                    .setStyle(ButtonStyle.Secondary)
                            )
                        ]
                    });

                    // Update both historical and current stats with team information
                    console.log(`[DEBUG] Updating stats for ${memberId}:`);
                    console.log(`[DEBUG] - Minutes to add: ${minutes}`);
                    console.log(`[DEBUG] - Hours to add: ${(minutes / 60).toFixed(4)}`);
                    console.log(`[DEBUG] - Event linked: ${eventLinked}`);
                    console.log(`[DEBUG] - Team role: ${teamRole?.name || 'none'}`);
                    
                    await updateUserStats(memberId, minutes, false, eventLinked, user.username, user.displayAvatarURL());
                    await updateCurrentStats(memberId, user.username, minutes, eventLinked, teamRole);
                    
                    logger.logStatsUpdate(memberId, user.username, {
                        minutes,
                        eventLinked,
                        teamRole: teamRole ? `${teamRole.name} (${teamRole.id})` : 'none'
                    });
                } catch (err) {
                    logger.logError(err, {
                        userId: memberId,
                        username: user.username,
                        action: 'send_task_completion_prompt'
                    });
                }
            }, 1000);
            console.log(`[DEBUG] ====== END SETUP LEAVE EVENT ======`);
        }
    });
}

module.exports = {
    setupVoiceHandler,
    getActiveVC,
    markSubmitted
};
