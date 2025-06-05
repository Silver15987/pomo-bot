import { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';
import { Event } from '../db/event.js';

export const data = new SlashCommandBuilder()
  .setName('event-config')
  .setDescription('Configure event settings')
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new event')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('roles')
      .setDescription('Add roles to an event')
      .addStringOption(option =>
        option
          .setName('event_id')
          .setDescription('The ID of the event')
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('role1')
          .setDescription('First role to add')
          .setRequired(true)
      )
      .addRoleOption(option =>
        option
          .setName('role2')
          .setDescription('Second role to add')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('role3')
          .setDescription('Third role to add')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('role4')
          .setDescription('Fourth role to add')
          .setRequired(false)
      )
      .addRoleOption(option =>
        option
          .setName('role5')
          .setDescription('Fifth role to add')
          .setRequired(false)
      )
  );

export async function execute(interaction) {
  try {
    // Check if user has moderator permissions
    if (!interaction.member.permissions.has('ModerateMembers')) {
      return interaction.reply({
        content: '❌ You need moderator permissions to use this command.',
        ephemeral: true
      });
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'create') {
      // Create the modal
      const modal = new ModalBuilder()
        .setCustomId('event_modal')
        .setTitle('Create Event');

      // Add input fields
      const nameInput = new TextInputBuilder()
        .setCustomId('event_name')
        .setLabel('Event Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const descriptionInput = new TextInputBuilder()
        .setCustomId('event_description')
        .setLabel('Event Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const startDateInput = new TextInputBuilder()
        .setCustomId('event_start')
        .setLabel('Start Date (YYYY-MM-DD HH:mm)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('2024-03-20 14:00');

      const endDateInput = new TextInputBuilder()
        .setCustomId('event_end')
        .setLabel('End Date (YYYY-MM-DD HH:mm)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('2024-03-20 16:00');

      // Create action rows
      const firstRow = new ActionRowBuilder().addComponents(nameInput);
      const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
      const thirdRow = new ActionRowBuilder().addComponents(startDateInput);
      const fourthRow = new ActionRowBuilder().addComponents(endDateInput);

      // Add rows to modal
      modal.addComponents(firstRow, secondRow, thirdRow, fourthRow);

      // Show the modal
      await interaction.showModal(modal);
    }
    else if (subcommand === 'roles') {
      const eventId = interaction.options.getString('event_id');
      const roles = [
        interaction.options.getRole('role1'),
        interaction.options.getRole('role2'),
        interaction.options.getRole('role3'),
        interaction.options.getRole('role4'),
        interaction.options.getRole('role5')
      ].filter(role => role !== null);

      // Find the event
      const event = await Event.findById(eventId);
      if (!event) {
        return interaction.reply({
          content: '❌ Event not found.',
          ephemeral: true
        });
      }

      // Update event roles
      event.targetRoles = roles.map(role => role.id);
      await event.save();

      // Create success embed
      const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('Event Roles Updated')
        .addFields(
          { name: 'Event ID', value: eventId, inline: true },
          { name: 'Added Roles', value: roles.map(role => role.toString()).join('\n'), inline: false },
          { name: 'Total Roles', value: roles.length.toString(), inline: true }
        )
        .setTimestamp();

      await interaction.reply({
        embeds: [embed],
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('[EVENT-CONFIG] Error:', error);
    await interaction.reply({
      content: '❌ An error occurred while processing your request.',
      ephemeral: true
    });
  }
} 