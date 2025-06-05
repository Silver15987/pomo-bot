import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { debugActiveEvents } from '../utils/eventLinkage.js';

export const data = new SlashCommandBuilder()
  .setName('debug-events')
  .setDescription('Shows all active events and their roles')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    
    // Call the debug function
    await debugActiveEvents(interaction.guildId);
    
    await interaction.editReply({
      content: 'Check the console for active events debug information.',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error in debug-events command:', error);
    await interaction.editReply({
      content: 'An error occurred while fetching event information.',
      ephemeral: true
    });
  }
} 