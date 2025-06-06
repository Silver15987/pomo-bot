import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('say')
  .setDescription('Make the bot say something')
  .addStringOption(option =>
    option.setName('message')
      .setDescription('The message to say')
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers); // Only moderators can use this

export async function execute(interaction) {
  try {
    const message = interaction.options.getString('message');
    
    // Delete the original command message
    await interaction.deferReply({ ephemeral: true });
    await interaction.deleteReply();
    
    // Send the message
    await interaction.channel.send(message);
    
    console.log(`[SAY] User ${interaction.user.tag} (${interaction.user.id}) used say command in channel ${interaction.channel.name} (${interaction.channel.id})`);
  } catch (error) {
    console.error('[SAY] Error executing say command:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ 
        content: 'There was an error sending the message.', 
        ephemeral: true 
      });
    }
  }
} 