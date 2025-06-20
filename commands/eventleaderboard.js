import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { Event } from '../db/event.js';

export const data = new SlashCommandBuilder()
  .setName('eventleaderboard')
  .setDescription('View the current event leaderboard');

export async function execute(interaction) {
  try {
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply();

    // Find the active event
    const event = await Event.findOne({ 
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (!event) {
      return interaction.editReply({
        content: '❌ There is no active event at the moment.'
      });
    }

    // Sort teams by total time
    const sortedTeams = [...event.teamStats].sort(
      (a, b) => (b.totalTime || 0) - (a.totalTime || 0)
    );

    // Debug: Let's see what we have before role fetching
    console.log('[LEADERBOARD] Original sorted teams:', sortedTeams.map(team => ({
      roleId: team.roleId,
      totalTime: team.totalTime,
      memberCount: team.memberCount,
      topMembersLength: team.topMembers ? team.topMembers.length : 0
    })));

    // Fetch role objects to get actual team names
    const guild = interaction.guild;
    const teamsWithNames = await Promise.allSettled(
      sortedTeams.map(async (team) => {
        try {
          const role = await guild.roles.fetch(team.roleId);
          // Convert Mongoose document to plain object to avoid spread issues
          const plainTeam = {
            roleId: team.roleId,
            totalTime: team.totalTime,
            memberCount: team.memberCount,
            dailyChange: team.dailyChange,
            lastUpdated: team.lastUpdated,
            topMembers: team.topMembers,
            teamName: role ? role.name : `Unknown Role (${team.roleId})`
          };
          console.log(`[LEADERBOARD] Processed team ${team.roleId}:`, {
            totalTime: plainTeam.totalTime,
            teamName: plainTeam.teamName
          });
          return plainTeam;
        } catch (error) {
          console.warn(`[LEADERBOARD] Could not fetch role ${team.roleId}:`, error.message);
          return {
            roleId: team.roleId,
            totalTime: team.totalTime,
            memberCount: team.memberCount,
            dailyChange: team.dailyChange,
            lastUpdated: team.lastUpdated,
            topMembers: team.topMembers,
            teamName: `Unknown Role (${team.roleId})`
          };
        }
      })
    );

    // Extract successful results and handle failures
    const processedTeams = teamsWithNames.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`[LEADERBOARD] Failed to process team ${index}:`, result.reason);
        return {
          ...sortedTeams[index],
          teamName: `Team ${index + 1}` // Fallback to generic name
        };
      }
    });

    // Build the embed
    const embed = {
      title: `🏆 Event Leaderboard: ${event.name}`,
      description: `📅 Duration: ${event.startDate.toLocaleDateString()} - ${event.endDate.toLocaleDateString()}\n⏰ Last Updated: ${event.lastUpdated.toLocaleString()}`,
      color: 0x0099FF,
      fields: []
    };

    // Add team sections
    processedTeams.forEach((team, index) => {
      const medal = ['🥇', '🥈', '🥉'][index] || '▫️';
      
      // Debug log to see what we're getting
      console.log(`[LEADERBOARD] Team ${index}:`, {
        teamName: team.teamName,
        totalTime: team.totalTime,
        totalTimeType: typeof team.totalTime,
        memberCount: team.memberCount
      });
      
      // Ensure totalTime is a proper number
      const totalTimeSeconds = Number(team.totalTime) || 0;
      const hours = Math.floor(totalTimeSeconds / 3600);
      const minutes = Math.floor((totalTimeSeconds % 3600) / 60);

      // Handle missing or empty topMembers array
      const topMembers = team.topMembers || [];
      const membersList = topMembers.length > 0 
        ? topMembers.map((member, i) => {
            const memberTime = Number(member.totalTime) || 0;
            const memberSessions = Number(member.sessions) || 0;
            return `${i + 1}. <@${member.userId}> ⏱️ ${Math.floor(memberTime / 3600)}h 📚 ${memberSessions} sessions`;
          }).join('\n')
        : 'No active members';

      embed.fields.push({
        name: `${medal} ${team.teamName} (${hours}h ${minutes}m)`,
        value: membersList,
        inline: false
      });
    });

    // Add team gaps with actual team names and visual graphs
    if (processedTeams.length > 1) {
      const gaps = processedTeams.map((team, i) => {
        if (i === 0) return null;
        
        // Convert to proper numbers
        const currentTeamTime = Number(team.totalTime) || 0;
        const leadingTeamTime = Number(processedTeams[i-1].totalTime) || 0;
        const gap = leadingTeamTime - currentTeamTime;
        const gapHours = Math.floor(gap / 3600);
        
        // Create visual progress bar
        const leadingTeamHours = Math.floor(leadingTeamTime / 3600);
        const currentTeamHours = Math.floor(currentTeamTime / 3600);
        const maxHours = Math.floor(Number(processedTeams[0].totalTime) / 3600); // First place team hours
        
        // Avoid division by zero
        if (maxHours === 0) {
          return `**${team.teamName}** needs **${gapHours}h** to catch up to **${processedTeams[i-1].teamName}**`;
        }
        
        // Calculate bar lengths (max 20 characters for the bar)
        const maxBarLength = 20;
        const leadingTeamBar = Math.round((leadingTeamHours / maxHours) * maxBarLength);
        const currentTeamBar = Math.round((currentTeamHours / maxHours) * maxBarLength);
        
        // Create the visual bars
        const leadingBar = '█'.repeat(Math.max(0, leadingTeamBar)) + '░'.repeat(Math.max(0, maxBarLength - leadingTeamBar));
        const currentBar = '█'.repeat(Math.max(0, currentTeamBar)) + '░'.repeat(Math.max(0, maxBarLength - currentTeamBar));
        
        return `**${processedTeams[i-1].teamName}** ${leadingBar} ${leadingTeamHours}h
**${team.teamName}** ${currentBar} ${currentTeamHours}h
Gap: **${gapHours}h** behind\n`;
      }).filter(Boolean);

      if (gaps.length > 0) {
        embed.fields.push({
          name: '📊 Team Gaps',
          value: gaps.join('\n'),
          inline: false
        });
      }
    }

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in leaderboard command:', error);
    
    // Check if we can still respond
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: '❌ An error occurred while fetching the leaderboard.',
        flags: [MessageFlags.Ephemeral]
      });
    } else {
      await interaction.editReply({
        content: '❌ An error occurred while fetching the leaderboard.'
      });
    }
  }
} 