const { Events } = require('discord.js');
const { teamRoles } = require('../config/event-config.json');
const { logger } = require('../utils/logger');

let trackedMessageId = null;
let trackedChannelId = null;
const userRoles = new Map(); // Track roles assigned to each user
const roleAssignments = new Map(); // Track how many users have each role

/**
 * Initializes the reaction listener for the client.
 */
function setupRoleReactionDistributor(client) {
    // Handle adding reactions
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
                return;
            }

            const guild = reaction.message.guild;
            const member = await guild.members.fetch(user.id);
            if (!member) return;

            // Check if user already has a team role
            const hasTeamRole = member.roles.cache.some(role => teamRoles.includes(role.id));
            if (hasTeamRole) {
                console.log(`[DEBUG] User ${user.username} already has a team role, skipping assignment`);
                return;
            }

            // Find the role with the least assignments
            let minCount = Infinity;
            let roleToAssign = null;
            
            for (const roleId of teamRoles) {
                const count = roleAssignments.get(roleId) || 0;
                if (count < minCount) {
                    minCount = count;
                    roleToAssign = roleId;
                }
            }

            if (roleToAssign) {
                const role = await guild.roles.fetch(roleToAssign);
                await member.roles.add(roleToAssign);
                
                // Update tracking
                roleAssignments.set(roleToAssign, (roleAssignments.get(roleToAssign) || 0) + 1);
                
                logger.logRoleAssign(
                    user.id,
                    user.username,
                    roleToAssign,
                    role.name
                );

                logger.logSystem('Role distribution updated', {
                    roleId: roleToAssign,
                    roleName: role.name,
                    userId: user.id,
                    username: user.username,
                    currentDistribution: Object.fromEntries(roleAssignments)
                });
            }
        } catch (err) {
            logger.logError(err, {
                userId: user.id,
                username: user.username,
                action: 'add_reaction_role'
            });
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
        
        // Clear all tracking when starting a new message
        userRoles.clear();
        roleAssignments.clear();

        logger.logSystem('Started tracking new reaction role message', {
            messageId,
            channelId,
            channelName: channel.name
        });
    } catch (err) {
        logger.logError(err, {
            action: 'setup_reaction_tracking',
            messageId,
            channelId
        });
    }
}

module.exports = {
    setupRoleReactionDistributor,
    trackReactionRoleMessage
};
