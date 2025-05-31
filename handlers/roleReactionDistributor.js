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

            // Get current role assignments for this user
            const userRoleIds = userRoles.get(user.id) || [];
            
            // Find the role with the least assignments
            let minCount = Infinity;
            let roleToAssign = null;
            
            for (const roleObj of teamRoles) {
                const count = roleAssignments.get(roleObj.id) || 0;
                if (count < minCount && !userRoleIds.includes(roleObj.id)) {
                    minCount = count;
                    roleToAssign = roleObj;
                }
            }

            if (roleToAssign) {
                const role = await guild.roles.fetch(roleToAssign.id);
                await member.roles.add(roleToAssign.id);
                
                // Update tracking
                userRoleIds.push(roleToAssign.id);
                userRoles.set(user.id, userRoleIds);
                roleAssignments.set(roleToAssign.id, (roleAssignments.get(roleToAssign.id) || 0) + 1);
                
                logger.logRoleAssign(
                    user.id,
                    user.username,
                    roleToAssign.id,
                    roleToAssign.name
                );

                logger.logSystem('Role distribution updated', {
                    roleId: roleToAssign.id,
                    roleName: roleToAssign.name,
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

    // Handle removing reactions
    client.on(Events.MessageReactionRemove, async (reaction, user) => {
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

            // Get current role assignments for this user
            const userRoleIds = userRoles.get(user.id) || [];
            
            // Remove all team roles
            for (const roleId of userRoleIds) {
                const roleObj = teamRoles.find(r => r.id === roleId);
                if (roleObj) {
                    await member.roles.remove(roleId);
                    roleAssignments.set(roleId, (roleAssignments.get(roleId) || 1) - 1);
                    
                    logger.logRoleRemove(
                        user.id,
                        user.username,
                        roleId,
                        roleObj.name
                    );
                }
            }
            
            // Clear user's role tracking
            userRoles.delete(user.id);
            
            logger.logSystem('Roles removed and distribution updated', {
                userId: user.id,
                username: user.username,
                removedRoles: userRoleIds,
                currentDistribution: Object.fromEntries(roleAssignments)
            });
        } catch (err) {
            logger.logError(err, {
                userId: user.id,
                username: user.username,
                action: 'remove_reaction_role'
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
