const { allowedVoiceChannels } = require('../config/channel-config.json');
const { updateUserStats } = require('../db/userStats');
const { isWithinEventWindow } = require('../utils/eventUtils');
const { getUserActiveTask, abandonTask } = require('../db/tasks');
const { pendingTasks } = require('../sessionState');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { followupTimeoutMs } = require('../config/bot-config.json');

const activeVoiceUsers = new Map();
const joinTimes = new Map();
const submittedTaskUsers = new Set();

function markSubmitted(userId) {
    submittedTaskUsers.add(userId);
}

function getActiveVC(discordId) {
    return activeVoiceUsers.get(discordId);
}

function setupVoiceHandler(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const memberId = newState.id;
        const user = newState.member?.user || oldState.member?.user;
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;

        if (!oldChannelId && newChannelId && allowedVoiceChannels.includes(newChannelId)) {
            console.log(`${memberId} joined allowed VC ${newChannelId}`);
            activeVoiceUsers.set(memberId, newChannelId);
            joinTimes.set(memberId, Date.now());
            return;
        }

        if (oldChannelId && (!newChannelId || !allowedVoiceChannels.includes(newChannelId))) {
            console.log(`${memberId} left VC or joined non-allowed VC`);
            activeVoiceUsers.delete(memberId);

            const joinedAt = joinTimes.get(memberId);
            joinTimes.delete(memberId);

            const pending = pendingTasks.get(memberId);
            if (pending?.timeout) {
                clearTimeout(pending.timeout);
                console.log(`[${memberId}] Cleared reminder timeout on VC leave`);
            }
            pendingTasks.delete(memberId);

            if (pending?.message) {
                try {
                    const row = ActionRowBuilder.from(pending.message.components[0]);
                    row.components = row.components.map(button =>
                        ButtonBuilder.from(button).setDisabled(true)
                    );

                    await pending.message.edit({
                        components: [row],
                        embeds: [
                            {
                                title: "Session Cancelled",
                                description: "You left the VC before submitting a task. The session has been cancelled.",
                                color: 0xff9900
                            }
                        ]
                    });

                    console.log(`Disabled Enter Task button and cleared pending state for ${memberId}`);
                } catch (err) {
                    console.warn(`Failed to disable task DM for ${memberId}: ${err.message}`);
                }
            }

            let activeTask;
            try {
                activeTask = await getUserActiveTask(memberId);
            } catch (err) {
                console.error(`Error fetching active task on VC leave for ${memberId}: ${err.message}`);
                return;
            }

            if (!activeTask || !joinedAt) {
                console.log(`${memberId} left VC with no active task — no prompt sent`);
                return;
            }

            if (activeTask.kickedByBot) {
                await abandonTask(memberId);
                console.log(`${memberId} was kicked for inactivity — task marked abandoned`);
                return;
            }

            submittedTaskUsers.delete(memberId);
            const durationMs = Date.now() - joinedAt;
            const minutes = Math.floor(durationMs / 60000);
            const eventLinked = isWithinEventWindow();

            setTimeout(async () => {
                try {
                    const msg = await user.send({
                        content: `You spent ${minutes} min in the VC. Did you complete your task?`,
                        components: [new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('task_complete').setLabel("Yes, completed").setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('task_abandon').setLabel("Abandon").setStyle(ButtonStyle.Secondary)
                        )]
                    });

                    await updateUserStats(memberId, minutes, false, eventLinked);
                    console.log(`Prompted ${memberId} after VC leave and updated session stats`);

                    const timeout = setTimeout(async () => {
                        try {
                            await abandonTask(memberId);
                            const row = ActionRowBuilder.from(msg.components[0]);
                            row.components.forEach(btn => btn.setDisabled(true));
                            await msg.edit({
                                content: 'You didn’t respond in time. Task has been marked as abandoned.',
                                components: [row]
                            });
                            console.log(`VC exit prompt timed out — task abandoned for ${memberId}`);
                        } catch (err) {
                            console.warn(`Failed to update VC-exit prompt for ${memberId}: ${err.message}`);
                        }

                        try {
                            const guild = client.guilds.cache.get(oldState.guild.id);
                            const member = await guild.members.fetch(memberId);
                            if (member.voice?.channelId) {
                                await member.voice.disconnect("Task abandoned — no response after leaving VC");
                                console.log(`[${memberId}] Disconnected after no follow-up on exit`);
                            }
                        } catch (dcErr) {
                            console.warn(`[${memberId}] Failed to disconnect after no response: ${dcErr.message}`);
                        }
                    }, followupTimeoutMs);

                } catch (e) {
                    console.warn(`Could not DM ${user.username} after VC leave: ${e.message}`);
                    await abandonTask(memberId);
                    console.log(`${memberId} could not be messaged — task abandoned by default`);
                }
            }, 2000); // Wait 2 seconds before sending DM
        }
    });
}

module.exports = {
    setupVoiceHandler,
    getActiveVC,
    markSubmitted
};
