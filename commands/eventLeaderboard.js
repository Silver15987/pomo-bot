const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getTopEventUsers } = require('../db/userCurrentStats');
const { teamRoles, eventEndDate } = require('../config/event-config.json');
const { leaderboardConfig } = require('../config/bot-config.json');

function formatTimeString(hours) {
    const totalHours = Math.floor(hours);
    const minutes = Math.round((hours - totalHours) * 60);
    return totalHours > 0 ? `${totalHours}h ${minutes}m` : `${minutes}m`;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eventleaderboard')
        .setDescription('View the event VC hours leaderboard')
        .addStringOption(option =>
            option.setName('team')
                .setDescription('View leaderboard for a specific team')
                .setRequired(false)
                .addChoices(
                    ...teamRoles.map(role => ({
                        name: role.name,
                        value: role.id
                    }))
                )),

    async execute(interaction) {
        try {
            const teamOption = interaction.options.getString('team');
            const users = await getTopEventUsers();
            
            if (!users || users.length === 0) {
                return interaction.editReply('No teams have earned any event VC hours yet!');
            }

            // Group users by team
            const teamUsers = {};
            users.forEach(user => {
                const teamId = user.team?.id;
                if (teamId) {
                    if (!teamUsers[teamId]) {
                        teamUsers[teamId] = [];
                    }
                    teamUsers[teamId].push(user);
                }
            });

            // Calculate team totals and positions
            const teamTotals = Object.entries(teamUsers).map(([teamId, members]) => ({
                teamId,
                totalHours: members.reduce((sum, user) => sum + user.eventVcHours, 0),
                members
            }));

            // Sort teams by total hours
            teamTotals.sort((a, b) => b.totalHours - a.totalHours);

            // Calculate positions and gaps
            teamTotals.forEach((team, index) => {
                team.position = index + 1;
                team.gap = index === 0 ? 0 : teamTotals[0].totalHours - team.totalHours;
            });

            // Filter for specific team if requested
            const displayTeams = teamOption 
                ? teamTotals.filter(team => team.teamId === teamOption)
                : teamTotals;

            const embed = new EmbedBuilder()
                .setTitle(`${leaderboardConfig.titleEmoji} Event Leaderboard`)
                .setColor(leaderboardConfig.embedColor)
                .setDescription('Team Rankings by Total Event VC Hours');

            // Add team rankings
            const teamEntries = displayTeams.map(team => {
                const teamRole = teamRoles.find(role => role.id === team.teamId);
                const positionMedal = team.position === 1 ? leaderboardConfig.firstPlaceEmoji : 
                                    team.position === 2 ? leaderboardConfig.secondPlaceEmoji : 
                                    team.position === 3 ? leaderboardConfig.thirdPlaceEmoji : '';
                
                // Get top 3 members sorted by hours
                const topMembers = team.members
                    .sort((a, b) => b.eventVcHours - a.eventVcHours)
                    .slice(0, leaderboardConfig.topMembersPerTeam)
                    .map((member, index) => {
                        const timeString = formatTimeString(member.eventVcHours);
                        return `${index === 0 ? leaderboardConfig.topMemberEmoji : leaderboardConfig.memberEmoji} ${member.username}: ${timeString}`;
                    })
                    .join('\n');

                const teamTimeString = formatTimeString(team.totalHours);
                const gapString = team.gap > 0 ? 
                    `⬇️ Behind by: ${Math.round(team.gap * 60)}m` : 
                    `${leaderboardConfig.leadingEmoji} Currently leading!`;

                return `${positionMedal} ${teamRole?.name || 'Unknown Team'} ${teamRole ? `<@&${teamRole.id}>` : ''}\n` +
                       `${leaderboardConfig.timeEmoji} Total: ${teamTimeString}\n` +
                       `${gapString}\n` +
                       `👑 Top Members:\n${topMembers}\n` +
                       `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
            });

            embed.addFields({ name: 'Team Rankings', value: teamEntries.join('\n\n') });

            // Add footer with event end date
            embed.setFooter({ 
                text: `Event ends: ${new Date(eventEndDate).toLocaleDateString()}•${new Date().toLocaleTimeString()}` 
            });

            await interaction.editReply({ embeds: [embed] });
        } catch (error) {
            console.error('Error in eventLeaderboard command:', error);
            await interaction.editReply('An error occurred while fetching the leaderboard. Please try again later.');
        }
    }
}; 