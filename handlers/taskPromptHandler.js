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

                console.log(`Sent task entry DM to ${member.id}`);

                const timeout = setTimeout(async () => {
                    const entry = pendingTasks.get(member.id);
                    if (!entry) return;

                    const stillInVC = !!getActiveVC(member.id);
                    if (!stillInVC) return;

                    const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
                    const guildMember = await guild.members.fetch(member.id).catch(() => null);
                    if (!guildMember || !guildMember.voice?.channelId) return;

                    try {
                        const row = ActionRowBuilder.from(message.components[0]);
                        row.components.forEach(btn => btn.setDisabled(true));
                        await message.edit({
                            components: [row],
                            embeds: [
                                new EmbedBuilder()
                                    .setTitle("Session Timed Out")
                                    .setDescription("You didn’t respond in time. You’ve been removed from the VC.")
                                    .setColor(0xff0000)
                            ]
                        });
                        console.log(`[${member.id}] Disabled task button and updated message`);
                    } catch (err) {
                        console.warn(`[${member.id}] Failed to edit DM: ${err.message}`);
                    }

                    try {
                        await guildMember.voice.disconnect("No task submitted in time");
                        console.log(`[${member.id}] Kicked due to no task submission`);
                    } catch (kickErr) {
                        console.warn(`[${member.id}] Failed to disconnect from VC: ${kickErr.message}`);
                    }

                    pendingTasks.delete(member.id);
                }, taskTimeoutMs);

                pendingTasks.set(member.id, { timeout, message });
                console.log(`[${member.id}] Task entry timeout scheduled (${taskTimeoutMs}ms)`);

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

            if (!task || isNaN(duration) || duration < 1 || duration > 180) {
                return interaction.reply({
                    content: 'Invalid input. Duration must be between 1 and 180 minutes.',
                    flags: 64
                });
            }

            const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
            const member = await guild.members.fetch(userId).catch(() => null);
            const roleId = member?.roles.cache.find(r => teamRoles.includes(r.id))?.id || null;
            const eventLinked = isWithinEventWindow();

            try {
                const existingTask = await getUserActiveTask(userId);
                if (existingTask) {
                    return interaction.reply({
                        content: 'You already have an active task. Complete or abandon it first.',
                        flags: 64
                    });
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

                await interaction.reply({
                    content: `Task saved: ${task} for ${duration} minutes.`,
                    flags: 64
                });

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
                                content: 'You didn’t respond in time. Task has been marked as abandoned and you’ve been removed from VC.'
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
