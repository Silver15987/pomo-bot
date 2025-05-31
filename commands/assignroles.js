const { SlashCommandBuilder } = require('discord.js');
const { trackReactionRoleMessage } = require('../handlers/roleReactionDistributor');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('assignroles')
        .setDescription('Set up a message for team role assignment')
        .addStringOption(option =>
            option.setName('channel')
                .setDescription('The channel ID where the role message is')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('message')
                .setDescription('The message ID where users will react')
                .setRequired(true)),

    async execute(interaction) {
        const channelId = interaction.options.getString('channel');
        const messageId = interaction.options.getString('message');

        try {
            await trackReactionRoleMessage(channelId, messageId, interaction.client);
            await interaction.reply({
                content: `Now tracking ✅ reactions on message \`${messageId}\` in channel \`${channelId}\`. Roles will be assigned in round-robin.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error setting up role assignment:', error);
            await interaction.reply({
                content: 'Failed to set up role assignment. Please check the channel and message IDs.',
                ephemeral: true
            });
        }
    }
}; 