const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTopUsers } = require('../db/userCurrentStats');
const { pointsMultiplier } = require('../config/bot-config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Shows the top 10 users with the highest VC points'),

    async execute(interaction) {
        await interaction.deferReply();
        
        try {
            const topUsers = await getTopUsers(10);

            if (topUsers.length === 0) {
                return interaction.editReply('No users have earned any VC points yet!');
            }

            // Create leaderboard embed
            const embed = new EmbedBuilder()
                .setTitle('🏆 VC Points Leaderboard')
                .setColor(0x00b0f4)
                .setDescription(`Top 10 users with the highest VC points (${pointsMultiplier} points per hour)`)
                .setTimestamp();

            // Add each user to the leaderboard
            const leaderboardEntries = topUsers.map((user, index) => {
                const totalHours = Math.floor(user.totalVcHours);
                const totalMinutes = Math.round((user.totalVcHours - totalHours) * 60);
                const eventHours = Math.floor(user.eventVcHours);
                const eventMinutes = Math.round((user.eventVcHours - eventHours) * 60);
                
                const totalTimeString = totalHours > 0 
                    ? `${totalHours}h ${totalMinutes}m` 
                    : `${totalMinutes}m`;
                const eventTimeString = eventHours > 0 
                    ? `${eventHours}h ${eventMinutes}m` 
                    : `${eventMinutes}m`;
                
                // Calculate points based on multiplier
                const totalPoints = Math.round(user.totalVcHours * pointsMultiplier);
                const eventPoints = Math.round(user.eventVcHours * pointsMultiplier);
                
                return `${index + 1}. ${user.username}\n` +
                       `   Total: ${totalTimeString} (${totalPoints} points)\n` +
                       `   Event: ${eventTimeString} (${eventPoints} points)`;
            });

            embed.addFields({ name: 'Rankings', value: leaderboardEntries.join('\n') });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            await interaction.editReply('Failed to fetch the leaderboard. Please try again later.');
        }
    }
}; 