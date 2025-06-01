const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { logger } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something (Admin only)')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('What should the bot say?')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Only visible to admins

    async execute(interaction) {
        try {
            // Get the message to say
            const message = interaction.options.getString('message');

            // Log the command usage
            logger.logSystem('Say command used', {
                userId: interaction.user.id,
                username: interaction.user.username,
                message: message,
                channelId: interaction.channelId
            });

            // Send the message as the bot
            await interaction.channel.send(message);

            // Edit the deferred reply to be invisible and ephemeral
            try {
                await interaction.editReply({ content: '\u200B', ephemeral: true });
            } catch (e) {
                // Ignore if already deleted or replied
            }
        } catch (error) {
            logger.logError(error, {
                action: 'say_command',
                userId: interaction.user.id,
                username: interaction.user.username,
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack
                }
            });

            // Only show error message if something went wrong
            try {
                await interaction.editReply({
                    content: 'An error occurred while sending the message. Please try again later.',
                    ephemeral: true
                });
            } catch (e) {
                // Ignore if already deleted or replied
            }
        }
    },
}; 