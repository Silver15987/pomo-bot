import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { manualCleanup } from '../utils/sessionCleanup.js';

export const data = new SlashCommandBuilder()
  .setName('admin-cleanup-sessions')
  .setDescription('Manually clean up stale sessions (Admin only)')
  .addIntegerOption(option =>
    option.setName('max_age_hours')
      .setDescription('Maximum age of active sessions before cleanup (default: 12 hours)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(168) // 1 week max
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    const maxAgeHours = interaction.options.getInteger('max_age_hours') || 12;

    await interaction.deferReply({ ephemeral: true });

    console.log(`[ADMIN-CLEANUP] Manual session cleanup triggered by ${interaction.user.tag} (max age: ${maxAgeHours} hours)`);

    const cleanedCount = await manualCleanup(maxAgeHours);

    await interaction.editReply({
      content: `✅ **Session Cleanup Complete**\n\n` +
        `**Sessions cleaned:** ${cleanedCount}\n` +
        `**Max age:** ${maxAgeHours} hours\n` +
        `**Triggered by:** ${interaction.user.tag}\n\n` +
        `${cleanedCount === 0 ? 'No stale sessions found.' : `${cleanedCount} stale sessions were closed and stats updated.`}`
    });

  } catch (error) {
    console.error('[ADMIN-CLEANUP] Error in manual cleanup command:', error);
    
    const errorMessage = '❌ **Error during session cleanup**\n\n' +
      'An error occurred while cleaning up sessions. Check the bot logs for details.';

    if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
} 