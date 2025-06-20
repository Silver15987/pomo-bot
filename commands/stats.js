import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { UserStats } from '../db/userStats.js';

export const data = new SlashCommandBuilder()
  .setName('stats')
  .setDescription('View your study statistics');

export async function execute(interaction) {
  try {
    await interaction.deferReply();

    // Get user stats
    const userStats = await UserStats.findOne({ userId: interaction.user.id });
    if (!userStats) {
      return interaction.editReply('❌ No statistics found. Start studying to track your progress!');
    }

    // Calculate time in hours, minutes, seconds
    const totalSeconds = userStats.totalStudyTime;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    // Calculate average session time
    const avgSessionTime = userStats.totalSessions > 0 
      ? Math.floor(totalSeconds / userStats.totalSessions) 
      : 0;
    const avgHours = Math.floor(avgSessionTime / 3600);
    const avgMinutes = Math.floor((avgSessionTime % 3600) / 60);
    const avgSeconds = avgSessionTime % 60;

    // Get current week's dates
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6); // Saturday

    // Week days and emojis
    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const weekEmojis = ['🌞', '🌙', '🌙', '🌙', '🌙', '🌙', '🌙'];

    // Calculate weekly progress
    const weeklyProgress = weekDays.map((day, index) => {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + index);
      
      const studied = userStats.studyDays.some(studyDay => 
        studyDay.toDateString() === date.toDateString()
      );
      
      return {
        day,
        emoji: studied ? '📚' : weekEmojis[index],
        studied
      };
    });

    // Count studied days this week
    const studiedDaysThisWeek = weeklyProgress.filter(day => day.studied).length;

    // Check if user studied today
    const todayStr = today.toDateString();
    const studiedToday = userStats.studyDays.some(studyDay => 
      studyDay.toDateString() === todayStr
    );

    // Build the embed
    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`📊 Study Statistics for ${interaction.user.username}`)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        {
          name: '⏱️ Time Statistics',
          value: `• Total Study Time: ${hours}h ${minutes}m ${seconds}s\n• Total Sessions: ${userStats.totalSessions}\n• Average Session: ${avgHours}h ${avgMinutes}m ${avgSeconds}s`,
          inline: false
        },
        {
          name: '📅 Today\'s Progress',
          value: studiedToday 
            ? `• Studied today: ${hours}h ${minutes}m ${seconds}s\n• Sessions: ${userStats.totalSessions}\n• Last updated: ${userStats.lastUpdated.toLocaleTimeString()}`
            : '• No study sessions today\n• Last study: ' + (userStats.lastStudyDay ? userStats.lastStudyDay.toLocaleDateString() : 'Never'),
          inline: false
        },
        {
          name: '📅 This Week\'s Progress',
          value: `${weekDays.join('  ')}\n${weeklyProgress.map(day => day.emoji).join('   ')}\n\n• Days Studied: ${studiedDaysThisWeek}/7\n• Weekly Streak: ${userStats.currentStreak} days\n• Last Study: ${userStats.lastStudyDay ? userStats.lastStudyDay.toLocaleDateString() : 'Never'}`,
          inline: false
        },
        {
          name: '📈 Consistency',
          value: `• Current Streak: ${userStats.currentStreak} days\n• Longest Streak: ${userStats.longestStreak} days\n• Study Days: ${userStats.studyDays.length}\n• Last Study Day: ${userStats.lastStudyDay ? userStats.lastStudyDay.toLocaleDateString() : 'Never'}`,
          inline: false
        },
        {
          name: '✅ Task Progress',
          value: `• Total Tasks: ${userStats.totalTasks}\n• Completed: ${userStats.completedTasks}\n• Abandoned: ${userStats.abandonedTasks}`,
          inline: false
        }
      )
      .setFooter({ 
        text: `Last Updated: ${userStats.lastUpdated.toLocaleString()}`
      });

    await interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error('Error in stats command:', error);
    await interaction.editReply({
      content: '❌ An error occurred while fetching your statistics.',
      flags: [MessageFlags.Ephemeral]
    });
  }
} 