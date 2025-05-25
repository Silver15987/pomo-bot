const { SlashCommandBuilder } = require('discord.js');
const { resetEventHours } = require('../db/userCurrentStats');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clearleaderboard')
        .setDescription('Clear all event VC points from the leaderboard (admin only)'),

    async execute(interaction) {
        console.log(`[ClearLeaderboard] Command initiated by user ${interaction.user.tag} (${interaction.user.id})`);
        
        try {
            // Check if user has admin permissions
            const member = await interaction.guild.members.fetch(interaction.user.id);
            console.log(`[ClearLeaderboard] User roles: ${member.roles.cache.map(role => role.name).join(', ')}`);
            
            if (!member.permissions.has('Administrator')) {
                console.log(`[ClearLeaderboard] Permission denied for user ${interaction.user.tag}`);
                return interaction.reply({
                    content: 'You need administrator permissions to use this command.',
                    ephemeral: true
                });
            }

            console.log('[ClearLeaderboard] User has admin permissions, proceeding with command');
            await interaction.deferReply({ ephemeral: true });

            try {
                console.log('[ClearLeaderboard] Attempting to reset event hours');
                await resetEventHours();
                console.log('[ClearLeaderboard] Successfully reset event hours');
                
                await interaction.editReply({
                    content: 'Successfully cleared all event VC points from the leaderboard. Total VC hours remain unchanged.',
                    ephemeral: true
                });
            } catch (error) {
                console.error('[ClearLeaderboard] Error in resetEventHours:', error);
                await interaction.editReply({
                    content: 'Failed to clear the leaderboard. Please try again later.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('[ClearLeaderboard] Error in command execution:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing the command. Please try again later.',
                    ephemeral: true
                }).catch(console.error);
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: 'An error occurred while processing the command. Please try again later.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }
}; 