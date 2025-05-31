const { SlashCommandBuilder } = require('discord.js');
const { resetEventHours } = require('../db/userCurrentStats');

//--------------------------------bug fix -------------------------------------//
/* Bug: DiscordAPIError[40060]: Interaction has already been acknowledged
Discord interactions are only valid for 3 seconds. If we don't respond within that time, the interaction becomes "unknown". 
clearleaderboard needs longer than 3 seconds to process so it tries to respond again but the interaction is already acknowledged.
To fix this:
1. Removed redundant deferReply() since it's now handled by the command handler
2. Using editReply() consistently for all responses
3. Added proper error handling for expired interactions
*/

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
                return interaction.editReply({
                    content: 'You need administrator permissions to use this command.',
                    ephemeral: true
                });
            }

            console.log('[ClearLeaderboard] User has admin permissions, proceeding with command');

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
            await interaction.editReply({
                content: 'An error occurred while processing the command. Please try again later.',
                ephemeral: true
            }).catch(console.error);
        }
    }
}; 