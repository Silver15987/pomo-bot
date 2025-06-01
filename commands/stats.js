const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getUserStats } = require('../db/userStats');
const { logger } = require('../utils/logger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View your study statistics'),

    async execute(interaction) {
        try {
            // logger.logSystem('Stats command started', {
            //     userId: interaction.user.id,
            //     username: interaction.user.username,
            //     guildId: interaction.guildId
            // });

            const userId = interaction.user.id;
            // logger.logSystem('Fetching user stats', {
            //     userId,
            //     username: interaction.user.username,
            //     userIdType: typeof userId
            // });

            try {
                const stats = await getUserStats(userId);
                // logger.logSystem('Stats fetch result', {
                //     userId,
                //     statsFound: !!stats,
                //     stats: stats ? {
                //         total_study_minutes: stats.total_study_minutes,
                //         total_event_minutes: stats.total_event_minutes,
                //         total_tasks: stats.total_tasks,
                //         completed_tasks: stats.completed_tasks,
                //         abandoned_tasks: stats.abandoned_tasks,
                //         completion_percentage: stats.completion_percentage,
                //         current_streak_days: stats.current_streak_days,
                //         longest_streak_days: stats.longest_streak_days,
                //         study_days_count: stats.study_days?.length || 0
                //     } : null
                // });

                if (!stats) {
                    // logger.logSystem('No stats found for user', {
                    //     userId,
                    //     username: interaction.user.username
                    // });
                    return interaction.editReply({
                        content: 'No statistics found. Start studying to track your progress!',
                        ephemeral: true
                    });
                }

                // Calculate hours from minutes
                const totalStudyHours = (stats.total_study_minutes / 60).toFixed(1);
                const totalEventHours = (stats.total_event_minutes / 60).toFixed(1);

                // Calculate total tasks and completion rate
                const totalTasks = stats.completed_tasks + stats.abandoned_tasks;
                const completionRate = totalTasks > 0 
                    ? ((stats.completed_tasks / totalTasks) * 100).toFixed(1)
                    : 0;

                // logger.logSystem('Creating embed with stats', {
                //     userId,
                //     totalStudyHours,
                //     totalEventHours,
                //     studyDaysCount: stats.study_days?.length || 0,
                //     completionRate,
                //     totalTasks,
                //     completedTasks: stats.completed_tasks,
                //     abandonedTasks: stats.abandoned_tasks
                // });

                // Create embed
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📊 Study Statistics')
                    .setAuthor({
                        name: stats.username || interaction.user.username,
                        iconURL: stats.avatar_url || interaction.user.displayAvatarURL()
                    })
                    .addFields(
                        { 
                            name: '⏱️ Study Time', 
                            value: `${totalStudyHours} hours\n${stats.total_study_minutes} minutes`,
                            inline: true 
                        },
                        { 
                            name: '🎯 Event Time', 
                            value: `${totalEventHours} hours\n${stats.total_event_minutes} minutes`,
                            inline: true 
                        },
                        { 
                            name: '📝 Tasks', 
                            value: `Total: ${totalTasks}\nCompleted: ${stats.completed_tasks}\nAbandoned: ${stats.abandoned_tasks}`,
                            inline: true 
                        },
                        { 
                            name: '📈 Completion Rate', 
                            value: `${completionRate}%`,
                            inline: true 
                        },
                        { 
                            name: '🔥 Streaks', 
                            value: `Current: ${stats.current_streak_days} days\nLongest: ${stats.longest_streak_days} days`,
                            inline: true 
                        }
                    )
                    .setFooter({ 
                        text: `Last updated: ${new Date(stats.updated_at).toLocaleDateString()}` 
                    });

                // Add study days if available
                if (stats.study_days && stats.study_days.length > 0) {
                    const last7Days = stats.study_days
                        .sort((a, b) => b.date.localeCompare(a.date))
                        .slice(0, 7);

                    // logger.logSystem('Processing study days', {
                    //     userId,
                    //     totalDays: stats.study_days.length,
                    //     last7DaysCount: last7Days.length,
                    //     dates: last7Days.map(day => day.date)
                    // });

                    const studyDaysText = last7Days
                        .map(day => `${day.date}: ${day.minutes} minutes`)
                        .join('\n');

                    embed.addFields({
                        name: '📅 Last 7 Days',
                        value: studyDaysText || 'No study data'
                    });
                }

                // logger.logSystem('Sending embed response', {
                //     userId,
                //     embedFields: embed.data.fields.length
                // });

                await interaction.editReply({ embeds: [embed] });

                // logger.logSystem('Stats command completed successfully', {
                //     userId: interaction.user.id,
                //     username: interaction.user.username
                // });
            } catch (dbError) {
                // logger.logError(dbError, {
                //     action: 'stats_command_db_operation',
                //     userId: interaction.user.id,
                //     username: interaction.user.username,
                //     error: {
                //         name: dbError.name,
                //         message: dbError.message,
                //         stack: dbError.stack
                //     }
                // });
                throw dbError; // Re-throw to be caught by outer catch
            }
        } catch (error) {
            // logger.logError(error, {
            //     action: 'stats_command',
            //     userId: interaction.user.id,
            //     username: interaction.user.username,
            //     error: {
            //         name: error.name,
            //         message: error.message,
            //         stack: error.stack
            //     }
            // });

            await interaction.editReply({
                content: 'An error occurred while fetching your statistics. Please try again later.',
                ephemeral: true
            });
        }
    },
}; 