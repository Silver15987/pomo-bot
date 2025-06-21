import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from 'discord.js';
import { UserStats } from '../db/userStats.js';

// TODO: ADMIN LOG CHANNEL CONFIGURATION
// ======================================
// Currently using environment variable ADMIN_LOG_CHANNEL_ID
// FUTURE IMPLEMENTATION: Move this to a persistent database collection
// - Create 'botSettings' or 'adminConfig' collection
// - Store channel IDs, permissions, and other admin settings
// - Allow dynamic configuration without restarting bot
// - Support multiple log channels for different operations
// ======================================

const ADMIN_LOG_CHANNEL_ID = process.env.ADMIN_LOG_CHANNEL_ID;

if (!ADMIN_LOG_CHANNEL_ID) {
  console.warn('⚠️ ADMIN_LOG_CHANNEL_ID not set - admin hour changes will not be logged');
}

export const data = new SlashCommandBuilder()
  .setName('manage-hours')
  .setDescription('Manage user study hours (Admin only)')
  .addSubcommand(subcommand =>
    subcommand
      .setName('add')
      .setDescription('Add hours to a user')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to add hours to')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for adding hours')
          .setRequired(true)
      )
      .addNumberOption(option =>
        option
          .setName('total')
          .setDescription('Hours to add to total study time')
          .setRequired(false)
          .setMinValue(0.01)
      )
      .addNumberOption(option =>
        option
          .setName('event')
          .setDescription('Hours to add to event study time')
          .setRequired(false)
          .setMinValue(0.01)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('remove')
      .setDescription('Remove hours from a user')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to remove hours from')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for removing hours')
          .setRequired(true)
      )
      .addNumberOption(option =>
        option
          .setName('total')
          .setDescription('Hours to remove from total study time')
          .setRequired(false)
          .setMinValue(0.01)
      )
      .addNumberOption(option =>
        option
          .setName('event')
          .setDescription('Hours to remove from event study time')
          .setRequired(false)
          .setMinValue(0.01)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('set')
      .setDescription('Set user hours to specific values')
      .addUserOption(option =>
        option
          .setName('user')
          .setDescription('The user to set hours for')
          .setRequired(true)
      )
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for setting hours')
          .setRequired(true)
      )
      .addNumberOption(option =>
        option
          .setName('total')
          .setDescription('Set total study time to this value')
          .setRequired(false)
          .setMinValue(0)
      )
      .addNumberOption(option =>
        option
          .setName('event')
          .setDescription('Set event study time to this value')
          .setRequired(false)
          .setMinValue(0)
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('reset-events')
      .setDescription('Reset ALL users event hours to 0')
      .addStringOption(option =>
        option
          .setName('reason')
          .setDescription('Reason for resetting all event hours')
          .setRequired(true)
      )
  );

// Helper function to convert hours to seconds
const hoursToSeconds = (hours) => Math.round(hours * 3600);

// Helper function to convert seconds to hours
const secondsToHours = (seconds) => (seconds / 3600).toFixed(2);

// Helper function to send admin log
const sendAdminLog = async (client, embed) => {
  if (!ADMIN_LOG_CHANNEL_ID) {
    console.warn('⚠️ Admin log channel not configured - skipping log message');
    return;
  }

  try {
    const channel = await client.channels.fetch(ADMIN_LOG_CHANNEL_ID);
    if (channel && channel.isTextBased()) {
      await channel.send({ embeds: [embed] });
      console.log(`📊 Admin log sent to channel ${ADMIN_LOG_CHANNEL_ID}`);
    } else {
      console.error('❌ Admin log channel not found or not text-based');
    }
  } catch (error) {
    console.error('❌ Failed to send admin log:', error.message);
  }
};

// Helper function to create log embed
const createLogEmbed = (operation, admin, user, changes, reason, color) => {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`📊 Hours ${operation}`)
    .setDescription(`**User:** ${user} | **By:** ${admin}`)
    .addFields(
      { name: '📝 Reason', value: reason, inline: false },
      { name: '🕐 Time', value: new Date().toLocaleString(), inline: false }
    )
    .setTimestamp();

  // Add fields for each change
  changes.forEach(change => {
    embed.addFields({ name: change.name, value: change.value, inline: true });
  });

  return embed;
};

export async function execute(interaction) {
  const subcommand = interaction.options.getSubcommand();
  const reason = interaction.options.getString('reason');
  const adminUser = interaction.user;

  // Check if user has required permissions
  const member = interaction.member;
  const hasAdminPermission = member.permissions.has(PermissionFlagsBits.Administrator);
  const hasAdminRole = member.roles.cache.some(role => 
    role.name.toLowerCase() === 'admin' || role.name.toLowerCase() === 'administrator'
  );
  const hasModRole = member.roles.cache.some(role => 
    role.name.toLowerCase() === 'mod' || 
    role.name.toLowerCase() === 'mods' || 
    role.name.toLowerCase() === 'moderator' || 
    role.name.toLowerCase() === 'moderators'
  );

  if (!hasAdminPermission && !hasAdminRole && !hasModRole) {
    await interaction.reply({
      content: '❌ You need Administrator permissions or Admin/Mod role to use this command.',
      ephemeral: true
    });
    return;
  }

  try {
    if (subcommand === 'reset-events') {
      // Handle reset-events subcommand
      await interaction.deferReply({ ephemeral: true });

      // Get count of users before reset
      const userCount = await UserStats.countDocuments({ eventStudyTime: { $gt: 0 } });
      
      if (userCount === 0) {
        await interaction.editReply('⚠️ No users have event study time to reset.');
        return;
      }

      // Reset all event hours
      const result = await UserStats.updateMany(
        {},
        { 
          $set: { 
            eventStudyTime: 0,
            currentEventRole: null,
            lastUpdated: new Date()
          }
        }
      );

      // Create log embed
      const logEmbed = new EmbedBuilder()
        .setColor(0xFF6B35) // Orange for reset
        .setTitle('📊 Event Hours Reset')
        .setDescription(`**By:** ${adminUser}`)
        .addFields(
          { name: '🔄 All users\' event study time set to 0', value: '\u200B', inline: false },
          { name: '👥 Users affected', value: `${result.modifiedCount} users`, inline: true },
          { name: '📝 Reason', value: reason, inline: false },
          { name: '🕐 Time', value: new Date().toLocaleString(), inline: false }
        )
        .setTimestamp();

      // Send log to admin channel
      await sendAdminLog(interaction.client, logEmbed);

      await interaction.editReply({
        content: `✅ **Event Hours Reset Complete**\n\n` +
          `🔄 Reset event study time for **${result.modifiedCount}** users\n` +
          `📝 **Reason:** ${reason}\n` +
          `📊 Log sent to admin channel`
      });

      console.log(`[ADMIN] ${adminUser.tag} reset event hours for ${result.modifiedCount} users. Reason: ${reason}`);
      return;
    }

    // Handle user-specific subcommands (add, remove, set)
    const targetUser = interaction.options.getUser('user');
    const totalHours = interaction.options.getNumber('total');
    const eventHours = interaction.options.getNumber('event');

    // Validation: at least one hour type must be specified
    if (!totalHours && !eventHours) {
      await interaction.reply({
        content: '❌ You must specify at least one of `total` or `event` hours.',
        ephemeral: true
      });
      return;
    }

    await interaction.deferReply({ ephemeral: true });

    // Find or create user stats
    const userStats = await UserStats.findOrCreate(targetUser.id, targetUser.username);
    
    // Store original values for logging
    const originalTotal = userStats.totalStudyTime;
    const originalEvent = userStats.eventStudyTime;

    const changes = [];

    // Process changes based on subcommand
    if (subcommand === 'add') {
      if (totalHours) {
        userStats.totalStudyTime += hoursToSeconds(totalHours);
        changes.push({
          name: '⏱️ Total Study Time',
          value: `+${totalHours} hours (${secondsToHours(originalTotal)} → ${secondsToHours(userStats.totalStudyTime)})`
        });
      }
      if (eventHours) {
        userStats.eventStudyTime += hoursToSeconds(eventHours);
        changes.push({
          name: '📅 Event Study Time',
          value: `+${eventHours} hours (${secondsToHours(originalEvent)} → ${secondsToHours(userStats.eventStudyTime)})`
        });
      }

    } else if (subcommand === 'remove') {
      if (totalHours) {
        const totalSeconds = hoursToSeconds(totalHours);
        if (totalSeconds > userStats.totalStudyTime) {
          await interaction.editReply({
            content: `❌ Cannot remove ${totalHours} hours from total study time. User only has ${secondsToHours(userStats.totalStudyTime)} hours.`
          });
          return;
        }
        userStats.totalStudyTime -= totalSeconds;
        changes.push({
          name: '⏱️ Total Study Time',
          value: `-${totalHours} hours (${secondsToHours(originalTotal)} → ${secondsToHours(userStats.totalStudyTime)})`
        });
      }
      if (eventHours) {
        const eventSeconds = hoursToSeconds(eventHours);
        if (eventSeconds > userStats.eventStudyTime) {
          await interaction.editReply({
            content: `❌ Cannot remove ${eventHours} hours from event study time. User only has ${secondsToHours(userStats.eventStudyTime)} hours.`
          });
          return;
        }
        userStats.eventStudyTime -= eventSeconds;
        changes.push({
          name: '📅 Event Study Time',
          value: `-${eventHours} hours (${secondsToHours(originalEvent)} → ${secondsToHours(userStats.eventStudyTime)})`
        });
      }

    } else if (subcommand === 'set') {
      if (totalHours !== null) {
        userStats.totalStudyTime = hoursToSeconds(totalHours);
        changes.push({
          name: '⏱️ Total Study Time',
          value: `${totalHours} hours (was ${secondsToHours(originalTotal)})`
        });
      }
      if (eventHours !== null) {
        userStats.eventStudyTime = hoursToSeconds(eventHours);
        changes.push({
          name: '📅 Event Study Time',
          value: `${eventHours} hours (was ${secondsToHours(originalEvent)})`
        });
      }
    }

    // Update last updated timestamp
    userStats.lastUpdated = new Date();
    await userStats.save();

    // Create log embed
    const colors = {
      add: 0x00FF00,    // Green
      remove: 0xFF0000, // Red
      set: 0x0099FF     // Blue
    };

    const operationNames = {
      add: 'Added',
      remove: 'Removed',
      set: 'Set'
    };

    const logEmbed = createLogEmbed(
      operationNames[subcommand],
      adminUser,
      targetUser,
      changes,
      reason,
      colors[subcommand]
    );

    // Send log to admin channel
    await sendAdminLog(interaction.client, logEmbed);

    // Reply to admin
    const changeText = changes.map(change => `${change.name}: ${change.value}`).join('\n');
    
    await interaction.editReply({
      content: `✅ **Hours ${operationNames[subcommand]}**\n\n` +
        `👤 **User:** ${targetUser}\n` +
        `${changeText}\n` +
        `📝 **Reason:** ${reason}\n` +
        `📊 Log sent to admin channel`
    });

    console.log(`[ADMIN] ${adminUser.tag} ${subcommand} hours for ${targetUser.tag}. Reason: ${reason}`);

  } catch (error) {
    console.error(`❌ Error in manage-hours command:`, error);
    
    const errorMessage = '❌ An error occurred while managing hours. Please check the console for details.';
    
    if (interaction.deferred) {
      await interaction.editReply({ content: errorMessage });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
} 