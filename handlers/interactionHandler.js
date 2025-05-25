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
                    
                    // Extend the task duration in the database
                    const extensionResult = await extendTaskDuration(userId, 15);
                    console.log(`[DEBUG] Database extension result for ${userId}:`, extensionResult);
                    
                    // Clear the existing timeout
                    const existingEntry = pendingTasks.get(userId);
                    if (existingEntry?.timeout) {
                        console.log(`[DEBUG] Clearing existing timeout for ${userId}`);
                        clearTimeout(existingEntry.timeout);
                    }

                    // Set up new timeout for the extended duration
                    const timeout = setTimeout(async () => {
                        console.log(`[DEBUG] Extended timeout triggered for ${userId}`);
                        
                        if (!getActiveVC(userId)) {
                            console.log(`[DEBUG] User ${userId} not in VC, skipping extension timeout`);
                            return;
                        }

                        const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                        const member = await guild.members.fetch(userId).catch(() => null);

                        if (!member?.voice?.channelId) {
                            console.log(`[DEBUG] User ${userId} not in voice channel, skipping extension timeout`);
                            return;
                        }

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
                            
                            if (!getActiveVC(userId)) {
                                console.log(`[DEBUG] User ${userId} not in VC during reminder timeout`);
                                return;
                            }

                            await abandonTask(userId);
                            console.log(`[DEBUG] Task abandoned for ${userId} after reminder timeout`);

                            try {
                                const row = ActionRowBuilder.from(reminder.components[0]);
                                row.components.forEach(btn => btn.setDisabled(true));
                                await reminder.edit({
                                    components: [row],
                                    content: "You didn't respond in time. Task has been marked as abandoned and you've been removed from VC."
                                });
                                console.log(`[DEBUG] Updated reminder message for ${userId}`);
                            } catch (err) {
                                console.warn(`[DEBUG] Failed to edit reminder for ${userId}:`, err.message);
                            }

                            try {
                                await member.voice.disconnect("Task abandoned due to no response");
                                console.log(`[DEBUG] Disconnected ${userId} from VC after reminder timeout`);
                            } catch (err) {
                                console.warn(`[DEBUG] Failed to disconnect ${userId}:`, err.message);
                            }

                            pendingTasks.delete(userId);
                        }, followupTimeoutMs);

                        pendingTasks.set(userId, { message: reminder, timeout: reminderTimeout });
                        console.log(`[DEBUG] Set new reminder timeout for ${userId}`);
                    }, 15 * 60000); // 15 minutes in milliseconds

                    // Update the pending tasks with the new timeout
                    pendingTasks.set(userId, { ...existingEntry, timeout });
                    console.log(`[DEBUG] Updated pending tasks for ${userId} with new timeout`);

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
