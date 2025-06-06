import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { UserStats } from '../db/userStats.js';
import { Event } from '../db/event.js';

export const data = new SlashCommandBuilder()
  .setName('clear-event-stats')
  .setDescription('Clear event study time for all users (Admin only)')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    // Get all active events
    const activeEvents = await Event.find({
      status: 'active',
      endDate: { $gt: new Date() }
    });

    if (activeEvents.length === 0) {
      return interaction.editReply('❌ No active events found.');
    }

    // Get all users with event study time
    const usersWithEventTime = await UserStats.find({
      eventStudyTime: { $gt: 0 }
    });

    if (usersWithEventTime.length === 0) {
      return interaction.editReply('ℹ️ No users have event study time to clear.');
    }

    // Clear event study time and current event role
    const updateResult = await UserStats.updateMany(
      { eventStudyTime: { $gt: 0 } },
      { 
        $set: { 
          eventStudyTime: 0,
          currentEventRole: null
        }
      }
    );

    await interaction.editReply({
      content: `✅ Successfully cleared event stats:
• Reset ${updateResult.modifiedCount} user profiles
• Preserved task and session history
• Event study time reset to 0 for all users
• Team stats preserved for historical reference`
    });

  } catch (error) {
    console.error('Error clearing event stats:', error);
    await interaction.editReply({
      content: '❌ An error occurred while clearing event stats.',
      ephemeral: true
    });
  }
} 