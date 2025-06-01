const {
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events
} = require('discord.js');

const { disallowedVoiceChannels, testMode } = require('../config/channel-config.json');
const { taskTimeoutMs, followupTimeoutMs } = require('../config/bot-config.json');
const { saveTask, abandonTask, getUserActiveTask, markTaskComplete, getInterruptedTasks, resumeInterruptedTask } = require('../db/tasks');
const { isWithinEventWindow } = require('../utils/eventUtils');
const { teamRoles } = require('../config/event-config.json');
const { markSubmitted, getActiveVC } = require('./voiceHandler');
const { pendingTasks } = require('../sessionState');
const TimeoutManager = require('../utils/timeoutManager');
const MessageFactory = require('../utils/messageFactory');

function setupTaskPromptHandler(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const member = newState.member;
        const channelId = newState.channelId;

        if (!oldState.channelId && channelId) {
            // First check if it's a disallowed channel
            if (disallowedVoiceChannels.includes(channelId)) {
                console.log(`[DEBUG] Skipping task prompt for ${member.id} in disallowed VC ${channelId}`);
                return;
            }

            // Then check test mode
            if (testMode.enabled) {
                if (!testMode.allowedChannels.includes(channelId)) {
                    console.log(`[DEBUG] Test mode: Skipping task prompt for ${member.id} in non-allowed VC ${channelId}`);
                    return;
                }
                console.log(`[DEBUG] Test mode: Allowing task prompt for ${member.id} in allowed VC ${channelId}`);
            }

            try {
                console.log(`[DEBUG] User ${member.id} joined VC at ${new Date().toISOString()}. Will be kicked in ${taskTimeoutMs/1000} seconds if no task is entered.`);
                
                // Try to send a test DM first
                try {
                    const testMessage = await member.send({
                        content: "Checking DM permissions...",
                        flags: 4096 // Ephemeral flag
                    });
                    await testMessage.delete().catch(() => {}); // Clean up test message
                } catch (dmError) {
                    console.log(`[DEBUG] User ${member.id} has DMs closed. Sending VC message.`);
                    // Send message in VC instead of kicking
                    try {
                        const channel = member.voice.channel;
                        if (channel) {
                            await channel.send(MessageFactory.getRandomDmClosedMessage(member.id));
                        }
                    } catch (messageError) {
                        console.error(`[DEBUG] Failed to send VC message to ${member.id}:`, messageError);
                    }
                    return;
                }

                // Check for active tasks first
                const activeTask = await getUserActiveTask(member.id);
                if (activeTask) {
                    console.log(`[DEBUG] Found active task for ${member.id}`);
                    const duration = activeTask.durationMinutes || 0;
                    const hours = Math.floor(duration / 60);
                    const minutes = duration % 60;
                    const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

                    const message = await member.send({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("Active Task Found")
                                .setDescription(`You already have an active task:\n\n**Task:** ${activeTask.task}\n**Duration:** ${timeString}\n\nWhat would you like to do?`)
                                .setColor(0x00b0f4)
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('task_complete')
                                    .setLabel("Complete Task")
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId('task_abandon')
                                    .setLabel("Abandon Task")
                                    .setStyle(ButtonStyle.Danger),
                                new ButtonBuilder()
                                    .setCustomId('task_continue')
                                    .setLabel("Continue Task")
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ]
                    });

                    const timeout = setTimeout(async () => {
                        const entry = pendingTasks.get(member.id);
                        if (!entry) {
                            console.log(`[DEBUG] No pending task found for ${member.id} - they might have already responded`);
                            return;
                        }

                        const stillInVC = !!getActiveVC(member.id);
                        if (!stillInVC) {
                            console.log(`[DEBUG] User ${member.id} is no longer in VC - skipping kick`);
                            return;
                        }

                        try {
                            const row = ActionRowBuilder.from(message.components[0]);
                            row.components.forEach(btn => btn.setDisabled(true));
                            await message.edit({
                                components: [row],
                                embeds: [
                                    new EmbedBuilder()
                                        .setTitle("Session Timed Out")
                                        .setDescription("You didn't respond in time. You've been removed from the VC.")
                                        .setColor(0xff0000)
                                ]
                            });
                        } catch (err) {
                            console.warn(`[${member.id}] Failed to edit DM: ${err.message}`);
                        }

                        try {
                            await abandonTask(member.id);
                            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                            const guildMember = await guild.members.fetch(member.id);
                            await guildMember.voice.disconnect("No response to active task");
                        } catch (err) {
                            console.error(`[DEBUG] Failed to handle timeout for ${member.id}:`, err.message);
                        }

                        pendingTasks.delete(member.id);
                    }, taskTimeoutMs);

                    pendingTasks.set(member.id, { timeout, message });
                    return;
                }

                // Check for interrupted tasks
                const interruptedTasks = await getInterruptedTasks(member.id);
                if (interruptedTasks && interruptedTasks.length > 0) {
                    const lastTask = interruptedTasks[0]; // Get the most recent interrupted task
                    const timeElapsed = Math.floor((new Date() - new Date(lastTask.startTime)) / 1000 / 60); // in minutes
                    const remainingDuration = Math.max(0, lastTask.durationMinutes - timeElapsed);

                    if (remainingDuration > 0) {
                        console.log(`[DEBUG] Found interrupted task for ${member.id} with ${remainingDuration} minutes remaining`);
                        
                        const message = await member.send({
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("Interrupted Task Found")
                                    .setDescription(`You have an interrupted task:\n\n**Task:** ${lastTask.task}\n**Time Remaining:** ${remainingDuration} minutes\n\nWould you like to continue this task?`)
                                    .setColor(0x00b0f4)
                            ],
                            components: [
                                new ActionRowBuilder().addComponents(
                                    new ButtonBuilder()
                                        .setCustomId('resume_task')
                                        .setLabel("Continue Task")
                                        .setStyle(ButtonStyle.Success),
                                    new ButtonBuilder()
                                        .setCustomId('abandon_task')
                                        .setLabel("Start New Task")
                                        .setStyle(ButtonStyle.Secondary)
                                )
                            ]
                        });

                        const timeout = setTimeout(async () => {
                            const entry = pendingTasks.get(member.id);
                            if (!entry) {
                                console.log(`[DEBUG] No pending task found for ${member.id} - they might have already responded`);
                                return;
                            }

                            const stillInVC = !!getActiveVC(member.id);
                            if (!stillInVC) {
                                console.log(`[DEBUG] User ${member.id} is no longer in VC - skipping kick`);
                                return;
                            }

                            try {
                                const row = ActionRowBuilder.from(message.components[0]);
                                row.components.forEach(btn => btn.setDisabled(true));
                                await message.edit({
                                    components: [row],
                                    embeds: [
                                        new EmbedBuilder()
                                            .setTitle("Session Timed Out")
                                            .setDescription("You didn't respond in time. You've been removed from the VC.")
                                            .setColor(0xff0000)
                                    ]
                                });
                            } catch (err) {
                                console.warn(`[${member.id}] Failed to edit DM: ${err.message}`);
                            }

                            try {
                                await abandonTask(member.id);
                                const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                const guildMember = await guild.members.fetch(member.id);
                                await guildMember.voice.disconnect("No response to interrupted task");
                            } catch (err) {
                                console.error(`[DEBUG] Failed to handle timeout for ${member.id}:`, err.message);
                            }

                            pendingTasks.delete(member.id);
                        }, taskTimeoutMs);

                        pendingTasks.set(member.id, { timeout, message });
                        return;
                    }
                }
                
                // If no interrupted task or task has no remaining time, proceed with normal task prompt
                const message = await member.send(MessageFactory.getRandomFocusMessage(member.id));
                console.log(`[DEBUG] Sent task entry DM to ${member.id}`);

                const timeout = setTimeout(async () => {
                    const entry = pendingTasks.get(member.id);
                    if (!entry) {
                        console.log(`[DEBUG] No pending task found for ${member.id} - they might have already submitted a task`);
                        return;
                    }

                    const stillInVC = !!getActiveVC(member.id);
                    if (!stillInVC) {
                        console.log(`[DEBUG] User ${member.id} is no longer in VC - skipping kick`);
                        return;
                    }

                    console.log(`[DEBUG] Timeout reached for ${member.id} at ${new Date().toISOString()}. Attempting to kick from VC...`);

                    console.log(`[DEBUG] Using guild ID from env: ${process.env.DISCORD_GUILD_ID}`);
                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                    if (!guild) {
                        console.error(`[DEBUG] Could not find guild with ID ${process.env.DISCORD_GUILD_ID}`);
                        // Try to find the correct guild
                        const allGuilds = client.guilds.cache.map(g => `${g.name} (${g.id})`);
                        console.log(`[DEBUG] Available guilds: ${allGuilds.join(', ')}`);
                        return;
                    }

                    console.log(`[DEBUG] Found guild: ${guild.name} (${guild.id})`);

                    // Get the current voice state directly from the guild
                    const voiceState = guild.voiceStates.cache.get(member.id);
                    if (!voiceState) {
                        console.error(`[DEBUG] Could not find voice state for ${member.id}`);
                        // Try to get the member and check their voice state
                        const guildMember = await guild.members.fetch(member.id).catch(err => {
                            console.error(`[DEBUG] Error fetching guild member ${member.id}: ${err.message}`);
                            return null;
                        });
                        
                        if (guildMember?.voice?.channelId) {
                            console.log(`[DEBUG] Found member in voice channel ${guildMember.voice.channelId}`);
                            try {
                                await guildMember.voice.setChannel(null, "No task submitted in time");
                                console.log(`[DEBUG] Successfully disconnected ${member.id} using setChannel`);
                                return;
                            } catch (err) {
                                console.error(`[DEBUG] Failed to disconnect using setChannel: ${err.message}`);
                            }
                        }
                        return;
                    }

                    console.log(`[DEBUG] Found voice state for ${member.id} in channel ${voiceState.channelId}`);

                    // Check bot permissions
                    const botMember = await guild.members.fetch(client.user.id);
                    const botPermissions = botMember.permissions;
                    
                    if (!botPermissions.has('MoveMembers')) {
                        console.error(`[DEBUG] Bot lacks MoveMembers permission in guild ${guild.id}`);
                        return;
                    }

                    try {
                        const row = ActionRowBuilder.from(message.components[0]);
                        row.components.forEach(btn => btn.setDisabled(true));
                        await message.edit({
                            components: [row],
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("Session Timed Out")
                                    .setDescription("You didn't respond in time. You've been removed from the VC.")
                                    .setColor(0xff0000)
                            ]
                        });
                        console.log(`[DEBUG] Disabled task button and updated message for ${member.id}`);
                    } catch (err) {
                        console.warn(`[${member.id}] Failed to edit DM: ${err.message}`);
                    }

                    try {
                        // First mark the task as abandoned
                        await abandonTask(member.id);
                        console.log(`[DEBUG] Task marked as abandoned for ${member.id} due to timeout`);
                        
                        // Try multiple methods to disconnect the user
                        try {
                            await voiceState.disconnect("No task submitted in time");
                            console.log(`[DEBUG] Successfully kicked ${member.id} using voiceState.disconnect`);
                        } catch (disconnectErr) {
                            console.error(`[DEBUG] Failed to disconnect using voiceState.disconnect: ${disconnectErr.message}`);
                            
                            // Try alternative method
                            const guildMember = await guild.members.fetch(member.id);
                            if (guildMember?.voice?.channelId) {
                                await guildMember.voice.setChannel(null, "No task submitted in time");
                                console.log(`[DEBUG] Successfully kicked ${member.id} using setChannel`);
                            }
                        }
                    } catch (kickErr) {
                        console.error(`[DEBUG] Failed to disconnect ${member.id} from VC: ${kickErr.message}`);
                        if (kickErr.code === 50013) {
                            console.error(`[DEBUG] Bot lacks required permissions to disconnect users`);
                        }
                    }

                    pendingTasks.delete(member.id);
                }, taskTimeoutMs);

                pendingTasks.set(member.id, { timeout, message });
                console.log(`[DEBUG] Task entry timeout scheduled for ${member.id} (${taskTimeoutMs}ms)`);

            } catch (err) {
                console.warn(`Could not DM ${member.user.tag}: ${err.message}`);
            }
        }
    });

    client.on(Events.InteractionCreate, async interaction => {
        const userId = interaction.user.id;

        if (interaction.isButton()) {
            if (interaction.customId === `openTaskModal-${userId}`) {
                const modal = new ModalBuilder()
                    .setCustomId(`taskSubmit-${userId}`)
                    .setTitle("Enter Task & Duration");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('task')
                            .setLabel("Task Description")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('duration')
                            .setLabel("Duration (1–180 mins)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

                console.log(`[${userId}] Opening task modal`);
                await interaction.showModal(modal);
            } else if (interaction.customId === 'resume_task') {
                await interaction.deferUpdate();
                await resumeInterruptedTask(userId);
                
                // Get the interrupted task to calculate remaining time
                const interruptedTasks = await getInterruptedTasks(userId);
                if (interruptedTasks && interruptedTasks.length > 0) {
                    const lastTask = interruptedTasks[0];
                    const timeElapsed = Math.floor((new Date() - new Date(lastTask.startTime)) / 1000 / 60);
                    const remainingDuration = Math.max(0, lastTask.durationMinutes - timeElapsed);

                    // Set up completion timeout for remaining duration
                    const timeout = setTimeout(async () => {
                        console.log(`[DEBUG] Task completion timeout triggered for ${userId}`);
                        if (!getActiveVC(userId)) {
                            console.log(`[DEBUG] User ${userId} is no longer in VC - skipping completion prompt`);
                            return;
                        }

                        try {
                            const reminder = await interaction.user.send({
                                content: `Your task time is up. Did you complete your task?`,
                                components: [new ActionRowBuilder().addComponents(
                                    new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success),
                                    new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary),
                                    new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary)
                                )]
                            });

                            const reminderTimeout = setTimeout(async () => {
                                if (!getActiveVC(userId)) {
                                    console.log(`[DEBUG] User ${userId} is no longer in VC - skipping reminder timeout`);
                                    return;
                                }

                                await abandonTask(userId);
                                console.log(`[DEBUG] Task abandoned for ${userId} after reminder timeout`);

                                try {
                                    await reminder.edit({
                                        content: "You didn't respond in time. Task has been marked as abandoned.",
                                        components: [new ActionRowBuilder().addComponents(
                                            new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success).setDisabled(true),
                                            new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary).setDisabled(true),
                                            new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary).setDisabled(true)
                                        )]
                                    });
                                } catch (err) {
                                    console.warn(`[DEBUG] Failed to update reminder for ${userId}:`, err.message);
                                }

                                try {
                                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                    const member = await guild.members.fetch(userId);
                                    await member.voice.disconnect("Task abandoned - no response after timeout");
                                } catch (err) {
                                    console.error(`[DEBUG] Failed to disconnect ${userId} after reminder timeout:`, err.message);
                                }
                            }, followupTimeoutMs);

                            TimeoutManager.setUserTimeout(userId, reminderTimeout, reminder);
                        } catch (err) {
                            console.error(`[DEBUG] Failed to send completion prompt to ${userId}:`, err.message);
                            await abandonTask(userId);
                            return;
                        }
                    }, remainingDuration * 60 * 1000);

                    TimeoutManager.setUserTimeout(userId, timeout, null);
                }

                await interaction.editReply({
                    content: 'Task resumed. Your time will continue to be tracked.',
                    components: []
                });
            } else if (interaction.customId === 'abandon_task') {
                await interaction.deferUpdate();
                await abandonTask(userId);
                
                // Show the normal task modal
                const modal = new ModalBuilder()
                    .setCustomId(`taskSubmit-${userId}`)
                    .setTitle("Enter Task & Duration");

                modal.addComponents(
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('task')
                            .setLabel("Task Description")
                            .setStyle(TextInputStyle.Paragraph)
                            .setRequired(true)
                    ),
                    new ActionRowBuilder().addComponents(
                        new TextInputBuilder()
                            .setCustomId('duration')
                            .setLabel("Duration (1–180 mins)")
                            .setStyle(TextInputStyle.Short)
                            .setRequired(true)
                    )
                );

                await interaction.showModal(modal);
            }
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('taskSubmit-')) {
            const task = interaction.fields.getTextInputValue('task').trim();
            const duration = parseInt(interaction.fields.getTextInputValue('duration'), 10);

            console.log(`[DEBUG] User ${userId} submitted task: "${task}" for ${duration} minutes`);

            if (!task || isNaN(duration) || duration < 1 || duration > 180) {
                console.log(`[DEBUG] Invalid task submission from ${userId}: task="${task}", duration=${duration}`);
                return interaction.deferReply({ ephemeral: true })
                    .then(() => interaction.editReply({
                        content: 'Invalid input. Duration must be between 1 and 180 minutes.',
                        ephemeral: true
                    }))
                    .catch(error => {
                        if (error.code === 10062) {
                            console.log(`[DEBUG] Interaction expired for ${userId} during invalid input check`);
                        } else {
                            console.error(`[DEBUG] Error handling invalid input for ${userId}:`, error);
                        }
                    });
            }

            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
            const member = await guild.members.fetch(userId).catch(() => null);
            const roleId = member?.roles.cache.find(r => teamRoles.includes(r.id))?.id || null;
            const eventLinked = isWithinEventWindow();

            try {
                // First, acknowledge the interaction to prevent timeout
                await interaction.deferReply({ ephemeral: true }).catch(error => {
                    if (error.code === 10062) {
                        console.log(`[DEBUG] Interaction expired for ${userId} during deferReply`);
                        return null;
                    }
                    throw error;
                });

                if (!interaction.deferred) {
                    console.log(`[DEBUG] Could not defer reply for ${userId}, interaction may have expired`);
                    return;
                }

                const existingTask = await getUserActiveTask(userId);
                if (existingTask) {
                    // Instead of just rejecting, show the existing task and give options
                    const duration = existingTask.durationMinutes || 0; // Ensure we have a number
                    const hours = Math.floor(duration / 60);
                    const minutes = duration % 60;
                    const timeString = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

                    const response = await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setTitle("Active Task Found")
                                .setDescription(`You already have an active task:\n\n**Task:** ${existingTask.task}\n**Duration:** ${timeString}\n\nWhat would you like to do?`)
                                .setColor(0x00b0f4)
                        ],
                        components: [
                            new ActionRowBuilder().addComponents(
                                new ButtonBuilder()
                                    .setCustomId('task_complete')
                                    .setLabel("Complete Task")
                                    .setStyle(ButtonStyle.Success),
                                new ButtonBuilder()
                                    .setCustomId('task_abandon')
                                    .setLabel("Abandon Task")
                                    .setStyle(ButtonStyle.Danger),
                                new ButtonBuilder()
                                    .setCustomId('task_continue')
                                    .setLabel("Continue Task")
                                    .setStyle(ButtonStyle.Primary)
                            )
                        ]
                    });

                    // Set up a collector for the response
                    const filter = i => i.user.id === userId && ['task_complete', 'task_abandon', 'task_continue'].includes(i.customId);
                    const collector = response.createMessageComponentCollector({ filter, time: 300000 }); // 5 minutes

                    collector.on('collect', async i => {
                        try {
                            // First acknowledge the interaction
                            await i.deferUpdate().catch(error => {
                                if (error.code === 10062) {
                                    console.log(`[DEBUG] Button interaction expired for ${userId}`);
                                    return null;
                                }
                                throw error;
                            });

                            if (!i.deferred) {
                                console.log(`[DEBUG] Could not defer button update for ${userId}`);
                                return;
                            }
                            
                            switch (i.customId) {
                                case 'task_complete':
                                    await markTaskComplete(userId);
                                    await i.editReply({
                                        content: 'Task marked as complete. You can now enter a new task.',
                                        components: []
                                    }).catch(err => {
                                        console.error(`Failed to edit reply for task_complete: ${err.message}`);
                                    });
                                    break;
                                    
                                case 'task_abandon':
                                    await abandonTask(userId);
                                    await i.editReply({
                                        content: 'Task abandoned. You can now enter a new task.',
                                        components: []
                                    }).catch(err => {
                                        console.error(`Failed to edit reply for task_abandon: ${err.message}`);
                                    });
                                    break;
                                    
                                case 'task_continue':
                                    await i.editReply({
                                        content: 'Continuing with your current task.',
                                        components: []
                                    }).catch(err => {
                                        console.error(`Failed to edit reply for task_continue: ${err.message}`);
                                    });
                                    break;
                            }
                        } catch (err) {
                            console.error(`Error handling task action for ${userId}:`, err);
                            // Try to send a follow-up message if we can't edit the original
                            try {
                                await i.followUp({
                                    content: 'An error occurred while processing your request. Please try again.',
                                    ephemeral: true
                                });
                            } catch (followUpErr) {
                                console.error('Failed to send error message:', followUpErr);
                            }
                        } finally {
                            collector.stop();
                        }
                    });

                    collector.on('end', async collected => {
                        if (collected.size === 0) {
                            try {
                                await interaction.editReply({
                                    content: 'No response received. Your current task remains active.',
                                    components: []
                                }).catch(err => {
                                    console.error(`Failed to edit reply after collector end: ${err.message}`);
                                });
                            } catch (err) {
                                console.error('Failed to update message after collector end:', err);
                            }
                        }
                    });

                    return;
                }

                await saveTask(userId, task, duration, eventLinked, roleId);

                // Clear any existing timeouts and messages
                const entry = pendingTasks.get(userId);
                if (entry?.message) {
                    try {
                        const row = ActionRowBuilder.from(entry.message.components[0]);
                        row.components.forEach(btn => btn.setDisabled(true));
                        await entry.message.edit({ components: [row] });
                    } catch (editErr) {
                        console.warn(`[${userId}] Failed to disable button: ${editErr.message}`);
                    }
                }
                
                // Clear any existing timeouts
                TimeoutManager.clearUserTimeout(userId);
                markSubmitted(userId);

                await interaction.editReply({
                    content: `Task saved: ${task} for ${duration} minutes.`
                }).catch(console.error);

                console.log(`[DEBUG] Setting up task completion timeout for ${userId} (${duration} minutes)`);
                const timeout = setTimeout(async () => {
                    console.log(`[DEBUG] Task completion timeout triggered for ${userId}`);
                    if (!getActiveVC(userId)) {
                        console.log(`[DEBUG] User ${userId} is no longer in VC - skipping completion prompt`);
                        return;
                    }

                    try {
                        const reminder = await interaction.user.send({
                            content: `Your task time is up. Did you complete your task?`,
                            components: [new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary),
                                new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary)
                            )]
                        });

                        const reminderTimeout = setTimeout(async () => {
                            if (!getActiveVC(userId)) {
                                console.log(`[DEBUG] User ${userId} is no longer in VC - skipping reminder timeout`);
                                return;
                            }

                            await abandonTask(userId);
                            console.log(`[DEBUG] Task abandoned for ${userId} after reminder timeout`);

                            try {
                                await reminder.edit({
                                    content: "You didn't respond in time. Task has been marked as abandoned.",
                                    components: [new ActionRowBuilder().addComponents(
                                        new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success).setDisabled(true),
                                        new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary).setDisabled(true),
                                        new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary).setDisabled(true)
                                    )]
                                });
                            } catch (err) {
                                console.warn(`[DEBUG] Failed to update reminder for ${userId}:`, err.message);
                            }

                            try {
                                const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                                const member = await guild.members.fetch(userId);
                                await member.voice.disconnect("Task abandoned - no response after timeout");
                            } catch (err) {
                                console.error(`[DEBUG] Failed to disconnect ${userId} after reminder timeout:`, err.message);
                            }
                        }, followupTimeoutMs);

                        TimeoutManager.setUserTimeout(userId, reminderTimeout, reminder);
                    } catch (err) {
                        console.error(`[DEBUG] Failed to send completion prompt to ${userId}:`, err.message);
                        await abandonTask(userId);
                        return;
                    }
                }, duration * 60 * 1000); // Convert minutes to milliseconds

                TimeoutManager.setUserTimeout(userId, timeout, null);

            } catch (err) {
                console.error(`Error saving task for ${userId}:`, err);
                // Check if we can still edit the reply
                if (interaction.deferred) {
                    await interaction.editReply({
                        content: 'Failed to save your task. Please try again.',
                        components: []
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
                            content: 'Failed to save your task. Please try again.',
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
        }
    });
}

module.exports = { setupTaskPromptHandler };
