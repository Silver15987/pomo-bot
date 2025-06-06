import { SlashCommandBuilder } from 'discord.js';
import { Event } from '../db/event.js';

export const data = new SlashCommandBuilder()
  .setName('eventleaderboard')
  .setDescription('View the current event leaderboard');

export async function execute(interaction) {
  try {
    // Find the active event
    const event = await Event.findOne({ 
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (!event) {
      return interaction.reply({
        content: '❌ There is no active event at the moment.',
        ephemeral: true
      });
    }

    // Sort teams by total time
    const sortedTeams = [...event.teamStats].sort(
      (a, b) => b.totalTime - a.totalTime
    );

    // Build the embed
    const embed = {
      title: ` Event Leaderboard: ${event.name}`,
      description: `📅 Duration: ${event.startDate.toLocaleDateString()} - ${event.endDate.toLocaleDateString()}\n⏰ Last Updated: ${event.lastUpdated.toLocaleString()}`,
      color: 0x0099FF,
      fields: []
    };

    // Add team sections
    sortedTeams.forEach((team, index) => {
      const medal = ['🥇', '🥈', '🥉'][index] || '▫️';
      const hours = Math.floor(team.totalTime / 3600);
      const minutes = Math.floor((team.totalTime % 3600) / 60);

      embed.fields.push({
        name: `${medal} Team ${index + 1} (${hours}h ${minutes}m)`,
        value: team.topMembers.map((member, i) => 
          `${i + 1}. <@${member.userId}> ⏱️ ${Math.floor(member.totalTime / 3600)}h 📚 ${member.sessions} sessions`
        ).join('\n'),
        inline: false
      });
    });

    // Add team gaps
    const gaps = sortedTeams.map((team, i) => {
      if (i === 0) return null;
      const gap = sortedTeams[i-1].totalTime - team.totalTime;
      const gapHours = Math.floor(gap / 3600);
      return `Team ${i + 1} needs ${gapHours}h to catch up to Team ${i}`;
    }).filter(Boolean);

    embed.fields.push({
      name: '📊 Team Gaps',
      value: gaps.join('\n'),
      inline: false
    });

    await interaction.reply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in leaderboard command:', error);
    await interaction.reply({
      content: '❌ An error occurred while fetching the leaderboard.',
      ephemeral: true
    });
  }
} 