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

const { allowedVoiceChannels } = require('../config/channel-config.json');
const { taskTimeoutMs, followupTimeoutMs } = require('../config/bot-config.json');
const { saveTask, abandonTask, getUserActiveTask } = require('../db/tasks');
const { isWithinEventWindow } = require('../utils/eventUtils');
const { teamRoles } = require('../config/event-config.json');
const { markSubmitted, getActiveVC } = require('./voiceHandler');
const { pendingTasks } = require('../sessionState');

function setupTaskPromptHandler(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const member = newState.member;
        const channelId = newState.channelId;

        if (!oldState.channelId && channelId && allowedVoiceChannels.includes(channelId)) {
            try {
                console.log(`[DEBUG] User ${member.id} joined VC at ${new Date().toISOString()}. Will be kicked in ${taskTimeoutMs/1000} seconds if no task is entered.`);
                
                const message = await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle("Focus Session")
                            .setDescription("Please enter your task and how long you'll work on it (1–180 mins). If no response is received in 3 minutes, you'll be removed from VC.")
                            .setColor(0x00b0f4)
                    ],
                    components: [
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder()
                                .setCustomId(`openTaskModal-${member.id}`)
                                .setLabel("Enter Task")
                                .setStyle(ButtonStyle.Primary)
                        )
                    ]
                });

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

        if (interaction.isButton() && interaction.customId === `openTaskModal-${userId}`) {
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
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('taskSubmit-')) {
            const task = interaction.fields.getTextInputValue('task').trim();
            const duration = parseInt(interaction.fields.getTextInputValue('duration'), 10);

            console.log(`[DEBUG] User ${userId} submitted task: "${task}" for ${duration} minutes`);

            if (!task || isNaN(duration) || duration < 1 || duration > 180) {
                console.log(`[DEBUG] Invalid task submission from ${userId}: task="${task}", duration=${duration}`);
                return interaction.reply({
                    content: 'Invalid input. Duration must be between 1 and 180 minutes.',
                    ephemeral: true
                }).catch(console.error);
            }

            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
            const member = await guild.members.fetch(userId).catch(() => null);
            const roleId = member?.roles.cache.find(r => teamRoles.includes(r.id))?.id || null;
            const eventLinked = isWithinEventWindow();

            try {
                // First, acknowledge the interaction to prevent timeout
                await interaction.deferReply({ ephemeral: true });

                const existingTask = await getUserActiveTask(userId);
                if (existingTask) {
                    return interaction.editReply({
                        content: 'You already have an active task. Complete or abandon it first.'
                    }).catch(console.error);
                }

                await saveTask(userId, task, duration, eventLinked, roleId);

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

                clearTimeout(entry?.timeout);
                markSubmitted(userId);

                await interaction.editReply({
                    content: `Task saved: ${task} for ${duration} minutes.`
                }).catch(console.error);

                const timeout = setTimeout(async () => {
                    if (!getActiveVC(userId)) return;

                    let reminder;
                    try {
                        reminder = await interaction.user.send({
                            content: `Your task time is up. Did you complete your task?`,
                            components: [new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId('task_extend').setLabel("Need more time").setStyle(ButtonStyle.Primary),
                                new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary)
                            )]
                        });
                    } catch (err) {
                        await abandonTask(userId);
                        return;
                    }

                    const reminderTimeout = setTimeout(async () => {
                        if (!getActiveVC(userId)) return;

                        const guildMember = await guild.members.fetch(userId).catch(() => null);
                        if (!guildMember || !guildMember.voice?.channelId) return;

                        await abandonTask(userId);

                        try {
                            const row = ActionRowBuilder.from(reminder.components[0]);
                            row.components.forEach(btn => btn.setDisabled(true));
                            await reminder.edit({
                                components: [row],
                                content: "You didn't respond in time. Task has been marked as abandoned and you've been removed from VC."
                            });
                        } catch (err) {
                            console.warn(`[${userId}] Could not edit reminder: ${err.message}`);
                        }

                        try {
                            await guildMember.voice.disconnect("Task abandoned due to no response");
                        } catch (err) {
                            console.warn(`[${userId}] Failed to disconnect after timeout: ${err.message}`);
                        }

                        pendingTasks.delete(userId);
                    }, followupTimeoutMs);

                    pendingTasks.set(userId, { message: reminder, timeout: reminderTimeout });
                }, duration * 60000);

            } catch (err) {
                await interaction.reply({
                    content: 'Failed to save your task. Please try again.',
                    flags: 64
                });
            }
        }
    });
}

module.exports = { setupTaskPromptHandler };
