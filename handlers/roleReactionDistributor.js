const { Events } = require('discord.js');
const { teamRoles } = require('../config/event-config.json');

let trackedMessageId = null;
let trackedChannelId = null;
let roleCounter = 0;

/**
 * Initializes the reaction listener for the client.
 */
function setupRoleReactionDistributor(client) {
    client.on(Events.MessageReactionAdd, async (reaction, user) => {
        try {
            if (user.bot) return;

            if (reaction.partial) await reaction.fetch();
            if (reaction.message.partial) await reaction.message.fetch();

            const messageId = reaction.message.id;
            const channelId = reaction.message.channel.id;

            if (
                messageId !== trackedMessageId ||
                channelId !== trackedChannelId ||
                reaction.emoji.name !== '✅'
            ) {
                return; // Not the message we're tracking or wrong emoji
            }

            const guild = reaction.message.guild;
            const member = await guild.members.fetch(user.id);
            if (!member) return;

            // Remove any existing teamRoles first
            const existing = teamRoles.filter(r => member.roles.cache.has(r));
            if (existing.length > 0) {
                await member.roles.remove(existing);
            }

            const roleId = teamRoles[roleCounter % teamRoles.length];
            roleCounter++;

            await member.roles.add(roleId);
            console.log(`✅ Assigned role ${roleId} to ${user.tag} via reaction on message ${messageId}`);
        } catch (err) {
            console.error('Error handling reaction role:', err);
        }
    });
}

/**
 * Call this function to start tracking a new message in real time.
 */
async function trackReactionRoleMessage(channelId, messageId, client) {
    try {
        const channel = await client.channels.fetch(channelId);
        const message = await channel.messages.fetch(messageId);

        await message.react('✅');

        trackedMessageId = messageId;
        trackedChannelId = channelId;
        roleCounter = 0;

        console.log(`📌 Now tracking ✅ reactions on message ${messageId} in channel ${channelId}`);
    } catch (err) {
        console.error('❌ Failed to set up reaction tracking:', err);
    }
}

module.exports = {
    setupRoleReactionDistributor,
    trackReactionRoleMessage
};
