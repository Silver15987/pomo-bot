const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTopUsers } = require('../db/userCurrentStats');
const { pointsMultiplier } = require('../config/bot-config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the current VC hours leaderboard'),

    async execute(interaction) {
        await interaction.deferReply();

        try {
            const topUsers = await getTopUsers(10);
            const embed = new EmbedBuilder()
                .setTitle('VC Hours Leaderboard')
                .setColor(0x00b0f4)
                .setDescription('Top users by total VC hours')
                .setTimestamp();

            // Add each user to the leaderboard
            const leaderboardEntries = topUsers.map((user, index) => {
                const totalHours = Math.floor(user.totalVcHours);
                const totalMinutes = Math.round((user.totalVcHours - totalHours) * 60);
                const totalTimeString = totalHours > 0 
                    ? `${totalHours}h ${totalMinutes}m` 
                    : `${totalMinutes}m`;
                
                // Calculate points based on multiplier
                const totalPoints = Math.round(user.totalVcHours * pointsMultiplier);
                
                // Add team information if available
                const teamInfo = user.team?.id ? `\n   Team: ${user.team.name} (<@&${user.team.id}>)` : '';
                
                return `${index + 1}. ${user.username}${teamInfo}\n` +
                       `   Total: ${totalTimeString} (${totalPoints} points)`;
            });

            embed.addFields({ name: 'Rankings', value: leaderboardEntries.join('\n') });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply('Failed to fetch the leaderboard. Please try again later.');
        }
    }
}; 