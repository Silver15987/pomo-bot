const {
    Events,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder
} = require('discord.js');

const { markTaskComplete, abandonTask, extendTaskDuration } = require('../db/tasks');
const { updateUserStats } = require('../db/userStats');
const { isWithinEventWindow } = require('../utils/eventUtils');
const { getActiveVC } = require('./voiceHandler');
const { followupTimeoutMs } = require('../config/bot-config.json');
const { pendingTasks } = require('../sessionState');
const { trackReactionRoleMessage } = require('./roleReactionDistributor');
const TimeoutManager = require('../utils/timeoutManager');

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

        // ---------- Slash Command: /assignroles ----------
        if (interaction.isChatInputCommand() && interaction.commandName === 'assignroles') {
            const member = await interaction.guild.members.fetch(userId);
            const isAdmin = member.permissions.has('Administrator');

            if (!isAdmin) {
                return interaction.reply({
                    content: 'You need admin permissions to use this command.',
                    ephemeral: true
                });
            }

            const channelId = interaction.options.getString('channel');
            const messageId = interaction.options.getString('message');

            if (!channelId || !messageId) {
                return interaction.reply({
                    content: 'Both channel and message ID are required.',
                    ephemeral: true
                });
            }

            await trackReactionRoleMessage(channelId, messageId, client);

            return interaction.reply({
                content: `Now tracking ✅ reactions on message \`${messageId}\` in channel \`${channelId}\`. Roles will be assigned in round-robin.`,
                ephemeral: true
            });
        }

        // ---------- Task Interaction Buttons ----------
        if (!interaction.isButton()) return;
        if (interaction.customId.startsWith('openTaskModal-')) return;

        const eventLinked = isWithinEventWindow();

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

        try {
            switch (interaction.customId) {
                case 'task_complete': {
                    await markTaskComplete(userId);
                    await updateUserStats(userId, 0, true, eventLinked);

                    await interaction.reply({
                        content: 'Task marked as complete.',
                        flags: 64
                    });

                    if (getActiveVC(userId)) {
                        try {
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
                            });

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

                                    // Disable the task button
                                    try {
                                        const row = ActionRowBuilder.from(entry.message.components[0]);
                                        row.components.forEach(btn => btn.setDisabled(true));

                                        await entry.message.edit({
                                            components: [row],
                                            embeds: [
                                                new EmbedBuilder()
                                                    .setTitle("Session Timed Out")
                                                    .setDescription("You didn't respond in time. You've been removed from the VC.")
                                                    .setColor(0xff0000)
                                            ]
                                        });
                                        console.log(`[${userId}] Task button disabled successfully.`);
                                    } catch (editErr) {
                                        console.error(`[${userId}] Failed to disable task button: ${editErr.message}`);
                                    }

                                    // Disconnect the user from VC
                                    try {
                                        await member.voice.disconnect("No new task submitted");
                                        console.log(`[${userId}] Successfully disconnected from VC after timeout.`);
                                    } catch (disconnectErr) {
                                        console.warn(`[${userId}] Failed to disconnect from VC: ${disconnectErr.message}`);
                                    }

                                    // Remove the user from pending tasks
                                    pendingTasks.delete(userId);
                                    console.log(`[${userId}] Removed from pending tasks.`);
                                } catch (err) {
                                    console.error(`[${userId}] Error during follow-up timeout handling: ${err.message}`);
                                }
                            }, followupTimeoutMs);

                            if (pendingTasks.has(userId)) {
                                clearTimeout(pendingTasks.get(userId).timeout);
                            }

                            pendingTasks.set(userId, { message: promptMessage, timeout });
                        } catch (err) {
                            console.warn("Failed to send next-task DM after completion:", err.message);
                        }
                    }

                    break;
                }

                case 'task_abandon': {
                    await abandonTask(userId);

                    await interaction.reply({
                        content: 'Task marked as abandoned.',
                        flags: 64
                    });

                    if (getActiveVC(userId)) {
                        try {
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
                            });

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

                                    // Disable the task button
                                    try {
                                        const row = ActionRowBuilder.from(entry.message.components[0]);
                                        row.components.forEach(btn => btn.setDisabled(true));

                                        await entry.message.edit({
                                            components: [row],
                                            embeds: [
                                                new EmbedBuilder()
                                                    .setTitle("Session Timed Out")
                                                    .setDescription("You didn't respond in time. You've been removed from the VC.")
                                                    .setColor(0xff0000)
                                            ]
                                        });
                                        console.log(`[${userId}] Task button disabled successfully.`);
                                    } catch (editErr) {
                                        console.error(`[${userId}] Failed to disable task button: ${editErr.message}`);
                                    }

                                    // Disconnect the user from VC
                                    try {
                                        await member.voice.disconnect("No new task submitted");
                                        console.log(`[${userId}] Successfully disconnected from VC after timeout.`);
                                    } catch (disconnectErr) {
                                        console.warn(`[${userId}] Failed to disconnect from VC: ${disconnectErr.message}`);
                                    }

                                    // Remove the user from pending tasks
                                    pendingTasks.delete(userId);
                                    console.log(`[${userId}] Removed from pending tasks.`);
                                } catch (err) {
                                    console.error(`[${userId}] Error during follow-up timeout handling: ${err.message}`);
                                }
                            }, followupTimeoutMs);

                            if (pendingTasks.has(userId)) {
                                clearTimeout(pendingTasks.get(userId).timeout);
                            }

                            pendingTasks.set(userId, { message: promptMessage, timeout });
                        } catch (err) {
                            console.warn("Failed to send next-task DM after abandon:", err.message);
                        }
                    }

                    break;
                }

                case 'task_extend': {
                    console.log(`[DEBUG] User ${userId} requested task extension`);
                    
                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                    if (!TimeoutManager.validateUserState(userId, guild)) {
                        return interaction.reply({
                            content: 'Unable to process extension request. Please try again.',
                            flags: 64
                        });
                    }

                    // Extend the task duration in the database
                    const extensionResult = await extendTaskDuration(userId, 15);
                    console.log(`[DEBUG] Database extension result for ${userId}:`, extensionResult);
                    
                    // Clear existing timeout using the manager
                    TimeoutManager.clearUserTimeout(userId);

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
                                await disconnectUserWithRetry(member, "Task abandoned due to no response");
                            } catch (err) {
                                console.warn(`[DEBUG] Failed to disconnect ${userId}:`, err.message);
                            }

                            TimeoutManager.clearUserTimeout(userId);
                        }, followupTimeoutMs);

                        TimeoutManager.setUserTimeout(userId, reminderTimeout, reminder);
                    }, 15 * 60000);

                    // Update the pending tasks with the new timeout
                    TimeoutManager.setUserTimeout(userId, timeout, interaction.message);

                    await interaction.reply({
                        content: 'Task extended by 15 minutes.',
                        flags: 64
                    });
                    console.log(`[DEBUG] Sent extension confirmation to ${userId}`);
                    break;
                }

                default:
                    if (!interaction.replied && !interaction.deferred) {
                        await interaction.reply({
                            content: 'Unknown action.',
                            flags: 64
                        });
                    }
                    break;
            }
        } catch (err) {
            console.error('Error in button handler:', err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'Something went wrong.',
                    flags: 64
                });
            }
        }
    });
}

module.exports = { setupInteractionHandler };
