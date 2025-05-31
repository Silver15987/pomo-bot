const {
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const { markTaskComplete, abandonTask, extendTaskDuration } = require('../db/tasks');
const { updateUserStats } = require('../db/userStats');
const { updateCurrentStats, resetEventHours } = require('../db/userCurrentStats');
const { isWithinEventWindow } = require('../utils/eventUtils');
const { getActiveVC } = require('./voiceHandler');
const { followupTimeoutMs } = require('../config/bot-config.json');
const { pendingTasks } = require('../sessionState');
const { trackReactionRoleMessage } = require('./roleReactionDistributor');
const TimeoutManager = require('../utils/timeoutManager');
const { connectToDatabase } = require('../db/init');
const MessageFactory = require('../utils/messageFactory');

// Helper function for VC operations with retry
async function disconnectUserWithRetry(member, reason, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[DEBUG] Attempt ${attempt} to disconnect user ${member.id}`);
            await member.voice.disconnect(reason);
            console.log(`[DEBUG] Successfully disconnected user ${member.id} on attempt ${attempt}`);
            return true;
        } catch (err) {
            console.error(`[DEBUG] Failed to disconnect user ${member.id} on attempt ${attempt}:`, err.message);
            if (attempt === maxRetries) {
                throw err;
            }
            // Wait 1 second before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return false;
}

// Helper function for message updates
async function updateMessageWithRetry(message, content, components, embeds, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[DEBUG] Attempt ${attempt} to update message`);
            await message.edit({ content, components, embeds });
            console.log(`[DEBUG] Successfully updated message on attempt ${attempt}`);
            return true;
        } catch (err) {
            console.error(`[DEBUG] Failed to update message on attempt ${attempt}:`, err.message);
            if (attempt === maxRetries) {
                throw err;
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    return false;
}

function setupInteractionHandler(client) {
    client.on(Events.InteractionCreate, async interaction => {
        const userId = interaction.user.id;

        try {
            // Handle slash commands
            if (interaction.isChatInputCommand()) {
                console.log(`[InteractionHandler] Received command: ${interaction.commandName}`);

                // ---------- Slash Command: /assignroles ----------
                if (interaction.commandName === 'assignroles') {
                    const member = await interaction.guild.members.fetch(userId);
                    console.log(`[InteractionHandler] User roles for assignroles: ${member.roles.cache.map(role => role.name).join(', ')}`);
                    
                    const hasAdminRole = member.roles.cache.some(role => role.name === 'Admin');
                    if (!hasAdminRole) {
                        console.log(`[InteractionHandler] Permission denied for user ${interaction.user.tag} - no Admin role`);
                        return interaction.reply({
                            content: 'You need the Admin role to use this command.',
                            ephemeral: true
                        });
                    }
                }

                // ---------- Slash Command: /leaderboard ----------
                if (interaction.commandName === 'leaderboard') {
                    await interaction.deferReply();
                    try {
                        const { getTopUsers } = require('../db/userCurrentStats');
                        const topUsers = await getTopUsers(10);

                        if (topUsers.length === 0) {
                            return interaction.editReply('No users have earned any VC points yet!');
                        }

                        const { pointsMultiplier } = require('../config/bot-config.json');
                        const embed = new EmbedBuilder()
                            .setTitle('🏆 VC Points Leaderboard')
                            .setColor(0x00b0f4)
                            .setDescription(`Top 10 users with the highest VC points (${pointsMultiplier} points per hour)`)
                            .setTimestamp();

                        const leaderboardEntries = topUsers.map((user, index) => {
                            const totalHours = Math.floor(user.totalVcHours);
                            const totalMinutes = Math.round((user.totalVcHours - totalHours) * 60);
                            const totalTimeString = totalHours > 0 
                                ? `${totalHours}h ${totalMinutes}m` 
                                : `${totalMinutes}m`;
                            
                            const totalPoints = Math.round(user.totalVcHours * pointsMultiplier);
                            const teamInfo = user.team?.id ? `\n   Team: ${user.team.name} (<@&${user.team.id}>)` : '';
                            
                            return `${index + 1}. ${user.username}${teamInfo}\n` +
                                   `   Total: ${totalTimeString} (${totalPoints} points)`;
                        });

                        embed.addFields({ name: 'Rankings', value: leaderboardEntries.join('\n') });
                        await interaction.editReply({ embeds: [embed] });
                    } catch (error) {
                        console.error('Error fetching leaderboard:', error);
                        await interaction.editReply('Failed to fetch the leaderboard. Please try again later.');
                    }
                }

                // ---------- Slash Command: /clearleaderboard ----------
                if (interaction.commandName === 'clearleaderboard') {
                    console.log('[InteractionHandler] Processing clearleaderboard command');
                    
                    // Check if user has Admin role
                    const member = await interaction.guild.members.fetch(interaction.user.id);
                    console.log(`[InteractionHandler] User roles: ${member.roles.cache.map(role => role.name).join(', ')}`);
                    
                    const hasAdminRole = member.roles.cache.some(role => role.name === 'Admin');
                    if (!hasAdminRole) {
                        console.log(`[InteractionHandler] Permission denied for user ${interaction.user.tag} - no Admin role`);
                        return interaction.deferReply({ ephemeral: true })
                            .then(() => interaction.editReply({
                                content: 'You need the Admin role to use this command.',
                                ephemeral: true
                            }))
                            .catch(error => {
                                if (error.code === 10062) {
                                    console.log(`[DEBUG] Interaction expired for ${userId} during permission check`);
                                } else {
                                    console.error(`[DEBUG] Error handling permission check for ${userId}:`, error);
                                }
                            });
                    }

                    console.log('[InteractionHandler] User has Admin role, proceeding with command');
                    await interaction.deferReply({ ephemeral: true });

                    try {
                        console.log('[InteractionHandler] Attempting to reset event hours');
                        await resetEventHours();
                        console.log('[InteractionHandler] Successfully reset event hours');
                        
                        await interaction.editReply({
                            content: 'Successfully cleared all event VC points from the leaderboard. Total VC hours remain unchanged.',
                            ephemeral: true
                        });
                    } catch (error) {
                        console.error('[InteractionHandler] Error in resetEventHours:', error);
                        await interaction.editReply({
                            content: 'Failed to clear the leaderboard. Please try again later.',
                            ephemeral: true
                        });
                    }
                }

                return;
            }

            // Handle button interactions
            if (!interaction.isButton()) return;
            if (interaction.customId.startsWith('openTaskModal-')) return;

            const eventLinked = isWithinEventWindow();

            // Acknowledge the interaction immediately
            await interaction.deferReply({ ephemeral: true }).catch(error => {
                if (error.code === 10062) {
                    console.log(`[DEBUG] Interaction expired for ${userId} during button handling`);
                    return null;
                }
                throw error;
            });

            if (!interaction.deferred) {
                console.log(`[DEBUG] Could not defer reply for ${userId}, interaction may have expired`);
                return;
            }

            // Disable the buttons immediately
            if (interaction.message?.components?.length) {
                try {
                    const disabledComponents = interaction.message.components.map(row => {
                        const newRow = ActionRowBuilder.from(row);
                        newRow.components = newRow.components.map(button =>
                            ButtonBuilder.from(button).setDisabled(true)
                        );
                        return newRow;
                    });

                    await interaction.message.edit({ components: disabledComponents });
                } catch (editErr) {
                    console.warn('Failed to edit message components:', editErr.message);
                }
            }

            switch (interaction.customId) {
                case 'task_complete': {
                    await markTaskComplete(userId);
                    await updateUserStats(userId, 0, true, eventLinked);
                    await updateCurrentStats(userId, interaction.user.username, 0, eventLinked);

                    await interaction.editReply({
                        content: 'Task marked as complete.',
                        ephemeral: true
                    });

                    if (getActiveVC(userId)) {
                        try {
                            // Clear any existing timeouts first
                            TimeoutManager.clearUserTimeout(userId);

                            const promptMessage = await interaction.user.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle("Focus Session")
                                        .setDescription("Please enter your next task. If no response in 3 minutes, you'll be removed from VC.")
                                        .setColor(0x00b0f4)
                                ],
                                components: [
                                    new ActionRowBuilder().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId(`openTaskModal-${userId}`)
                                            .setLabel("Enter Task")
                                            .setStyle(ButtonStyle.Primary)
                                    )
                                ]
                            }).catch(async (err) => {
                                console.error(`[${userId}] Failed to send follow-up prompt:`, err);
                                // Try to send a message in the voice channel
                                try {
                                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                    const member = await guild.members.fetch(userId);
                                    const channel = member.voice.channel;
                                    if (channel) {
                                        await channel.send({
                                            content: `<@${userId}> ${MessageFactory.getRandomDmClosedMessage()}`,
                                            allowedMentions: { users: [userId] }
                                        }).catch(() => {});
                                    }
                                } catch (channelErr) {
                                    console.error(`[DEBUG] Failed to send channel message for ${userId}:`, channelErr);
                                }
                                return null;
                            });

                            if (!promptMessage) {
                                return; // Exit if we couldn't send the DM, but don't kick
                            }

                            const timeout = setTimeout(async () => {
                                console.log(`[${userId}] Timeout triggered for follow-up task.`);

                                const entry = pendingTasks.get(userId);
                                if (!entry?.message) {
                                    console.log(`[${userId}] No pending task message found. Exiting timeout.`);
                                    return;
                                }

                                if (!getActiveVC(userId)) {
                                    console.log(`[${userId}] User is no longer in an active VC. Exiting timeout.`);
                                    return;
                                }

                                try {
                                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                    const member = await guild.members.fetch(userId).catch(() => null);

                                    if (!member) {
                                        console.log(`[${userId}] Guild member not found. Exiting timeout.`);
                                        return;
                                    }

                                    if (!member.voice?.channelId) {
                                        console.log(`[${userId}] User is not in a voice channel. Exiting timeout.`);
                                        return;
                                    }

                                    console.log(`[${userId}] User still in VC. Proceeding to disconnect.`);
                                    await disconnectUserWithRetry(member, "No follow-up task entered");
                                } catch (err) {
                                    console.error(`[${userId}] Error in follow-up timeout:`, err);
                                }
                            }, followupTimeoutMs);

                            // Use TimeoutManager to set the new timeout
                            TimeoutManager.setUserTimeout(userId, timeout, promptMessage);
                        } catch (err) {
                            console.error(`[${userId}] Failed to send follow-up prompt:`, err);
                        }
                    }
                    break;
                }

                case 'task_abandon': {
                    await abandonTask(userId);

                    await interaction.editReply({
                        content: 'Task marked as abandoned.',
                        ephemeral: true
                    });

                    if (getActiveVC(userId)) {
                        try {
                            // Clear any existing timeouts first
                            TimeoutManager.clearUserTimeout(userId);

                            const promptMessage = await interaction.user.send({
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle("Focus Session")
                                        .setDescription("Please enter your next task. If no response in 3 minutes, you'll be removed from VC.")
                                        .setColor(0x00b0f4)
                                ],
                                components: [
                                    new ActionRowBuilder().addComponents(
                                        new ButtonBuilder()
                                            .setCustomId(`openTaskModal-${userId}`)
                                            .setLabel("Enter Task")
                                            .setStyle(ButtonStyle.Primary)
                                    )
                                ]
                            }).catch(async (err) => {
                                console.error(`[${userId}] Failed to send follow-up prompt:`, err);
                                // Try to send a message in the voice channel
                                try {
                                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                    const member = await guild.members.fetch(userId);
                                    const channel = member.voice.channel;
                                    if (channel) {
                                        await channel.send({
                                            content: `<@${userId}> ${MessageFactory.getRandomDmClosedMessage()}`,
                                            allowedMentions: { users: [userId] }
                                        }).catch(() => {});
                                    }
                                } catch (channelErr) {
                                    console.error(`[DEBUG] Failed to send channel message for ${userId}:`, channelErr);
                                }
                                return null;
                            });

                            if (!promptMessage) {
                                return; // Exit if we couldn't send the DM, but don't kick
                                return; // Exit if we couldn't send the DM
                            }

                            const timeout = setTimeout(async () => {
                                console.log(`[${userId}] Timeout triggered for follow-up task.`);

                                const entry = pendingTasks.get(userId);
                                if (!entry?.message) {
                                    console.log(`[${userId}] No pending task message found. Exiting timeout.`);
                                    return;
                                }

                                if (!getActiveVC(userId)) {
                                    console.log(`[${userId}] User is no longer in an active VC. Exiting timeout.`);
                                    return;
                                }

                                try {
                                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                    const member = await guild.members.fetch(userId).catch(() => null);

                                    if (!member) {
                                        console.log(`[${userId}] Guild member not found. Exiting timeout.`);
                                        return;
                                    }

                                    if (!member.voice?.channelId) {
                                        console.log(`[${userId}] User is not in a voice channel. Exiting timeout.`);
                                        return;
                                    }

                                    console.log(`[${userId}] User still in VC. Proceeding to disconnect.`);
                                    await disconnectUserWithRetry(member, "No follow-up task entered");
                                } catch (err) {
                                    console.error(`[${userId}] Error in follow-up timeout:`, err);
                                }
                            }, followupTimeoutMs);

                            // Use TimeoutManager to set the new timeout
                            TimeoutManager.setUserTimeout(userId, timeout, promptMessage);
                        } catch (err) {
                            console.error(`[${userId}] Failed to send follow-up prompt:`, err);
                        }
                    }
                    break;
                }

                case 'task_extend': {
                    console.log(`[DEBUG] User ${userId} requested task extension`);
                    
                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                    if (!TimeoutManager.validateUserState(userId, guild)) {
                        return interaction.editReply({
                            content: 'Unable to process extension request. Please try again.',
                            ephemeral: true
                        });
                    }

                    // Extend the task duration in the database
                    const extensionResult = await extendTaskDuration(userId, 15);
                    console.log(`[DEBUG] Database extension result for ${userId}:`, extensionResult);
                    
                    // Clear existing timeout using the manager
                    TimeoutManager.clearUserTimeout(userId);

                    await interaction.editReply({
                        content: 'Task duration extended by 15 minutes.',
                        ephemeral: true
                    });

                    // Set up new timeout for the extended duration
                    const timeout = setTimeout(async () => {
                        console.log(`[DEBUG] Extended timeout triggered for ${userId}`);
                        
                        if (!await TimeoutManager.validateVoiceState(userId, guild)) {
                            console.log(`[DEBUG] Skipping extension timeout for ${userId} - invalid voice state`);
                            return;
                        }

                        const member = await guild.members.fetch(userId);
                        console.log(`[DEBUG] Sending completion prompt to ${userId} after extension`);
                        
                        let reminder;
                        try {
                            reminder = await interaction.user.send({
                                content: `Your extended task time is up. Did you complete your task?`,
                                components: [new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success),
                                    new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary)
                                )]
                            });
                            console.log(`[DEBUG] Sent completion prompt to ${userId}`);
                        } catch (err) {
                            console.error(`[DEBUG] Failed to send completion prompt to ${userId}:`, err.message);
                            await abandonTask(userId);
                            return;
                        }

                        const reminderTimeout = setTimeout(async () => {
                            console.log(`[DEBUG] Reminder timeout triggered for ${userId}`);
                            
                            if (!await TimeoutManager.validateVoiceState(userId, guild)) {
                                console.log(`[DEBUG] Skipping reminder timeout for ${userId} - invalid voice state`);
                                return;
                            }

                            await abandonTask(userId);
                            console.log(`[DEBUG] Task abandoned for ${userId} after reminder timeout`);

                            try {
                                await updateMessageWithRetry(
                                    reminder,
                                    "You didn't respond in time. Task has been marked as abandoned and you've been removed from VC.",
                                    [new ActionRowBuilder().addComponents(
                                        new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success).setDisabled(true),
                                        new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary).setDisabled(true),
                                        new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary).setDisabled(true)
                                    )]
                                );
                            } catch (err) {
                                console.warn(`[DEBUG] Failed to update reminder for ${userId}:`, err.message);
                            }

                            try {
                                await disconnectUserWithRetry(member, "Task abandoned - no response after extension");
                            } catch (err) {
                                console.error(`[DEBUG] Failed to disconnect ${userId} after extension timeout:`, err.message);
                            }
                        }, followupTimeoutMs);

                        TimeoutManager.setUserTimeout(userId, reminderTimeout, reminder);
                    }, 15 * 60 * 1000); // 15 minutes

                    TimeoutManager.setUserTimeout(userId, timeout, null);
                    break;
                }

                case 'resume_task': {
                    await resumeInterruptedTask(userId);
                    await interaction.editReply({
                        content: 'Task resumed. Your time will continue to be tracked.',
                        ephemeral: true
                    });
                    break;
                }

                case 'complete_task': {
                    await markTaskComplete(userId);
                    await updateUserStats(userId, 0, true, eventLinked);
                    await updateCurrentStats(userId, interaction.user.username, 0, eventLinked);
                    await interaction.editReply({
                        content: 'Task marked as complete.',
                        ephemeral: true
                    });
                    break;
                }

                case 'abandon_task': {
                    await abandonTask(userId);
                    await interaction.editReply({
                        content: 'Task marked as abandoned.',
                        ephemeral: true
                    });
                    break;
                }

                case 'task_continue': {
                    await interaction.editReply({
                        content: 'Continuing with your current task.',
                        ephemeral: true
                    });
                    break;
                }

                default:
                    await interaction.editReply({
                        content: 'Unknown action.',
                        ephemeral: true
                    });
                    break;
            }
        } catch (err) {
            console.error('Error in interaction handler:', err);
            
            // Check if we can still respond to the interaction
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'Something went wrong.',
                    ephemeral: true
                }).catch(error => {
                    if (error.code === 10062) {
                        console.log(`[DEBUG] Interaction expired for ${userId} during error handling`);
                    } else {
                        console.error(`[DEBUG] Error editing reply for ${userId}:`, error);
                    }
                });
            } else if (!interaction.replied) {
                await interaction.deferReply({ ephemeral: true })
                    .then(() => interaction.editReply({
                        content: 'Something went wrong.',
                        ephemeral: true
                    }))
                    .catch(error => {
                        if (error.code === 10062) {
                            console.log(`[DEBUG] Interaction expired for ${userId} during error handling`);
                        } else {
                            console.error(`[DEBUG] Error handling error response for ${userId}:`, error);
                        }
                    });
            }
        }
    });
}

module.exports = { setupInteractionHandler };
