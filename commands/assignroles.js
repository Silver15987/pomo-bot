const { SlashCommandBuilder } = require('discord.js');
const { trackReactionRoleMessage } = require('../handlers/roleReactionDistributor');
const { teamRoles } = require('../config/event-config.json');
const { logger } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assignroles')
        .setDescription('Track reactions on a message to assign team roles')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel containing the message')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The ID of the message to track')
                .setRequired(true)),

    async execute(interaction) {
        try {
            // Check for Admin role
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.roles.cache.some(role => role.name === 'Admin')) {
                return interaction.editReply({
                    content: 'You need the Admin role to use this command.',
                    ephemeral: true
                });
            }

            // Validate channel and message
            const channelId = interaction.options.getChannel('channel').id;
            const messageId = interaction.options.getString('message');

            // Check if bot has required permissions
            const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
            const requiredPermissions = ['ManageRoles', 'AddReactions'];
            const missingPermissions = requiredPermissions.filter(perm => !botMember.permissions.has(perm));

            if (missingPermissions.length > 0) {
                return interaction.editReply({
                    content: `I'm missing the following permissions: ${missingPermissions.join(', ')}`,
                    ephemeral: true
                });
            }

            // Validate team roles exist
            const guild = interaction.guild;
            const missingRoles = [];
            for (const roleObj of teamRoles) {
                const role = await guild.roles.fetch(roleObj.id).catch(() => null);
                if (!role) {
                    missingRoles.push(roleObj.name);
                }
            }

            if (missingRoles.length > 0) {
                return interaction.editReply({
                    content: `The following team roles are missing: ${missingRoles.join(', ')}`,
                    ephemeral: true
                });
            }

            // Try to fetch the message to verify it exists
            const channel = await interaction.client.channels.fetch(channelId);
            const message = await channel.messages.fetch(messageId).catch(() => null);

            if (!message) {
                return interaction.editReply({
                    content: 'Could not find the specified message. Please make sure the message ID is correct and I can see the channel.',
                    ephemeral: true
                });
            }

            // Set up role tracking
            await trackReactionRoleMessage(channelId, messageId, interaction.client);

            // Send confirmation
            await interaction.editReply({
                content: `✅ Now tracking reactions on the message. Users can react with ✅ to get assigned a team role.`,
                ephemeral: true
            });

            logger.logSystem('Role tracking setup', {
                channelId,
                messageId,
                teamRoles: teamRoles.map(r => r.name)
            });
        } catch (error) {
            logger.logError(error, {
                action: 'assignroles_command',
                userId: interaction.user.id
            });
            
            await interaction.editReply({
                content: 'An error occurred while setting up role tracking. Please check the logs for details.',
                ephemeral: true
            });
        }
    },
}; 