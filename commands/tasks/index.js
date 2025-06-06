import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, MessageFlags, EmbedBuilder, ButtonBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { UserTodo } from '../../db/userTodo.js';
import { Task } from '../../db/task.js';

const PRIORITY_EMOJI = {
  high: '🔴',
  medium: '🟡',
  low: '🟢'
};
const CATEGORY_EMOJI = {
  Study: '📚',
  Work: '💼',
  Personal: '🏠',
  Other: '🗂️'
};

function paginate(tasks, page = 0, pageSize = 5) {
  const start = page * pageSize;
  const paginatedTasks = tasks.slice(start, start + pageSize);
  const totalPages = Math.ceil(tasks.length / pageSize);
  return { paginatedTasks, totalPages };
}

async function getUserTasks(userId, status = 'active') {
  try {
    console.log(`[TASKS] Getting tasks for user ${userId} with status ${status}`);
    const userTodo = await UserTodo.findOrCreate(userId);
    console.log(`[TASKS] Found userTodo for ${userId}:`, {
      activeTasks: userTodo.activeTasks?.length || 0,
      completedTasks: userTodo.completedTasks?.length || 0
    });
    
    let taskIds = [];
    if (status === 'active' || status === 'pending') {
      taskIds = userTodo.activeTasks;
    } else if (status === 'completed') {
      taskIds = userTodo.completedTasks;
    } else {
      taskIds = [...userTodo.activeTasks, ...userTodo.completedTasks];
    }
    
    console.log(`[TASKS] Task IDs for ${userId}:`, taskIds);
    
    let query = { _id: { $in: taskIds } };
    if (status === 'pending') {
      query.status = { $in: ['active', 'held'] };
    } else if (status === 'completed') {
      query.status = 'completed';
    } else if (status === 'active') {
      query.status = 'active';
    }
    
    console.log(`[TASKS] Query for ${userId}:`, query);
    const tasks = await Task.find(query).sort({ createdAt: -1 });
    console.log(`[TASKS] Found ${tasks.length} tasks for ${userId}`);
    return tasks;
  } catch (error) {
    console.error(`[TASKS] Error in getUserTasks for ${userId}:`, error);
    throw error;
  }
}

async function fuzzySearchTasks(userId, query, status = 'all') {
  const tasks = await getUserTasks(userId, status);
  if (!query) return [];
  const lower = query.toLowerCase();
  return tasks.filter(task => task.title.toLowerCase().includes(lower));
}

export const data = new SlashCommandBuilder()
  .setName('tasks')
  .setDescription('Manage your tasks')
  .addSubcommand(sub =>
    sub.setName('all')
      .setDescription('View all your tasks (active and completed)')
  )
  .addSubcommand(sub =>
    sub.setName('completed')
      .setDescription('View your completed tasks')
  )
  .addSubcommand(sub =>
    sub.setName('pending')
      .setDescription('View your pending tasks')
  )
  .addSubcommand(sub =>
    sub.setName('view')
      .setDescription('View a specific task')
      .addStringOption(opt =>
        opt.setName('name')
          .setDescription('The name of the task (fuzzy search)')
          .setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('track')
      .setDescription('Track a specific task')
      .addStringOption(opt =>
        opt.setName('name')
          .setDescription('The name of the task to track (fuzzy search)')
          .setRequired(true)
      )
  );

function getPaginationRow(page, totalPages, sub) {
  return new ActionRowBuilder().addComponents(
    [
      new ButtonBuilder()
        .setCustomId(`tasks_page_prev_${sub}`)
        .setLabel('Prev')
        .setStyle('Secondary')
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`tasks_page_next_${sub}`)
        .setLabel('Next')
        .setStyle('Secondary')
        .setDisabled(page >= totalPages - 1)
    ]
  );
}

export async function execute(interaction) {
  try {
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand(false) || 'active';
    console.log(`[DEBUG] /tasks command invoked by user ${userId} with subcommand: ${sub}`);
    
    // Defer the reply immediately to prevent timeout
    await interaction.deferReply({ ephemeral: true });
    
    let page = 0;
    if (interaction.options.getInteger('page')) page = interaction.options.getInteger('page');
    let tasks = [];
    let embed;
    let totalPages = 1;
    console.log(`[DEBUG] Processing /tasks ${sub} for user ${userId}`);
    
    if (sub === 'all') {
      console.log(`[DEBUG] Fetching all tasks for user ${userId}`);
      tasks = await getUserTasks(userId, 'all');
      console.log(`[DEBUG] Found ${tasks.length} tasks for user ${userId}`);
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '📋 All Tasks', 'all');
    } else if (sub === 'completed') {
      console.log(`[DEBUG] Fetching completed tasks for user ${userId}`);
      tasks = await getUserTasks(userId, 'completed');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '✅ Completed Tasks', 'completed');
    } else if (sub === 'pending') {
      console.log(`[DEBUG] Fetching pending tasks for user ${userId}`);
      tasks = await getUserTasks(userId, 'pending');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '⏳ Pending Tasks', 'pending');
    } else if (sub === 'view') {
      console.log(`[DEBUG] Processing /tasks view for user ${userId}`);
      const name = interaction.options.getString('name');
      const matches = await fuzzySearchTasks(userId, name, 'all');
      if (matches.length === 0) {
        await interaction.editReply({ content: 'No tasks found matching that name.', flags: [MessageFlags.Ephemeral] });
        return;
      } else if (matches.length === 1) {
        // Check if task is being tracked
        const { getTracking } = await import('../../utils/tracking.js');
        const isTracking = getTracking(userId)?.taskId === matches[0]._id.toString();
        
        embed = buildTaskDetailEmbed(matches[0]);
        const row = await getTaskActionButtons(matches[0]._id, isTracking);
        await interaction.editReply({ embeds: [embed], components: [row], flags: [MessageFlags.Ephemeral] });
        return;
      } else {
        console.log(`[DEBUG] Multiple tasks found for /tasks view, showing select menu`);
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('view_task_details')
          .setPlaceholder('Multiple tasks found. Select one to view details.')
          .addOptions(matches.slice(0, 25).map(task => ({
            label: task.title.length > 25 ? task.title.slice(0, 22) + '...' : task.title,
            value: task._id.toString()
          })));
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.editReply({ content: 'Multiple tasks found. Select one:', components: [row], flags: [MessageFlags.Ephemeral] });
        return;
      }
    } else if (sub === 'track') {
      console.log(`[DEBUG] Processing /tasks track for user ${userId}`);
      const name = interaction.options.getString('name');
      const matches = await fuzzySearchTasks(userId, name, 'all');
      if (matches.length === 0) {
        await interaction.editReply({ content: 'No tasks found matching that name.', flags: [MessageFlags.Ephemeral] });
        return;
      }
      await interaction.editReply({ content: `Started tracking: ${matches[0].title} (placeholder)`, flags: [MessageFlags.Ephemeral] });
      return;
    } else {
      console.log(`[DEBUG] Fetching active tasks for user ${userId}`);
      tasks = await getUserTasks(userId, 'active');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '📝 Your Tasks', 'active');
    }
    
    console.log(`[DEBUG] Preparing to reply with embed for /tasks ${sub}`);
    if (!embed) embed = buildTasksEmbed(tasks, page, totalPages, '📝 Your Tasks', 'active');
    const selectMenu = tasks.length > 0 ? new StringSelectMenuBuilder()
      .setCustomId('view_task_details')
      .setPlaceholder('Select a task to view details')
      .addOptions(tasks.map(task => ({
        label: task.title.length > 25 ? task.title.slice(0, 22) + '...' : task.title,
        value: task._id.toString()
      }))) : null;
    const row = selectMenu ? [new ActionRowBuilder().addComponents(selectMenu)] : [];
    if (['all', 'completed', 'pending', 'active'].includes(sub) && totalPages > 1) {
      row.push(getPaginationRow(page, totalPages, sub));
    }
    
    console.log(`[DEBUG] Sending reply for /tasks ${sub}`);
    await interaction.editReply({
      embeds: [embed],
      components: row,
      flags: [MessageFlags.Ephemeral]
    });
    console.log(`[DEBUG] Reply sent for /tasks ${sub}`);
  } catch (error) {
    console.error('[TASKS] Error in /tasks:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Error loading tasks.', flags: [MessageFlags.Ephemeral] });
    } else {
      await interaction.editReply({ content: 'Error loading tasks.', flags: [MessageFlags.Ephemeral] });
    }
  }
}

function buildTasksEmbed(tasks, page, totalPages, title, status) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(status === 'completed' ? '#43b581' : status === 'pending' ? '#faa61a' : '#00b0f4')
    .setFooter({ text: `Page ${page + 1} of ${totalPages} | Total: ${tasks.length}` })
    .setTimestamp();
  if (tasks.length === 0) {
    embed.setDescription('No tasks found!');
  } else {
    tasks.forEach((task, i) => {
      const priority = PRIORITY_EMOJI[task.priority] || '';
      const category = CATEGORY_EMOJI[task.category] || '';
      const deadline = task.deadline ? `<t:${Math.floor(new Date(task.deadline).getTime()/1000)}:D>` : 'No deadline';
      embed.addFields({
        name: `${i + 1 + page * 5}. ${task.title}`,
        value: `${priority} **Priority:** ${task.priority}\n${category} **Category:** ${task.category}\n⏰ **Deadline:** ${deadline}`
      });
    });
  }
  return embed;
}

// Export the function
export async function getTaskActionButtons(taskId, isTracking = false) {
  try {
    // First get the task to check its status
    const task = await Task.findById(taskId);
    if (!task) {
      console.log(`[TASKS] Task ${taskId} not found when getting action buttons`);
      return null;
    }

    console.log(`[TASKS] Getting action buttons for task ${taskId} with status: ${task.status}`);

    // If task is completed or abandoned, return null (no buttons)
    if (task.status === 'completed' || task.status === 'abandoned') {
      return null;
    }

    // For active tasks, show all action buttons
    return new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_${taskId}`)
          .setLabel('Complete')
          .setStyle('Success')
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`abandon_${taskId}`)
          .setLabel('Abandon')
          .setStyle('Danger')
          .setEmoji('❌'),
        new ButtonBuilder()
          .setCustomId(`edit_${taskId}`)
          .setLabel('Edit')
          .setStyle('Secondary')
          .setEmoji('✏️'),
        new ButtonBuilder()
          .setCustomId(`track_${taskId}`)
          .setLabel(isTracking ? 'Hold' : 'Start Tracking')
          .setStyle(isTracking ? 'Secondary' : 'Primary')
          .setEmoji(isTracking ? '⏸️' : '⏱️')
      );
  } catch (error) {
    console.error(`[TASKS] Error getting action buttons for task ${taskId}:`, error);
    return null;
  }
}

// Export the function
export function buildTaskDetailEmbed(task) {
  const priority = PRIORITY_EMOJI[task.priority] || '';
  const category = CATEGORY_EMOJI[task.category] || '';
  const deadline = task.deadline ? `<t:${Math.floor(new Date(task.deadline).getTime()/1000)}:D>` : 'No deadline';
  
  // Format time spent
  const totalHours = Math.floor(task.totalTimeSpent / 3600);
  const totalMinutes = Math.floor((task.totalTimeSpent % 3600) / 60);
  const timeSpent = task.totalTimeSpent > 0 
    ? `${totalHours}h ${totalMinutes}m (${task.totalTimeSpent}s total)`
    : 'No time tracked yet';
  
  // Format last session if exists
  const lastSession = task.timeLog.length > 0 
    ? task.timeLog[task.timeLog.length - 1]
    : null;
  const lastSessionInfo = lastSession 
    ? `Last session: ${Math.floor(lastSession.duration / 60)}m (${lastSession.duration}s) at <t:${Math.floor(new Date(lastSession.start).getTime()/1000)}:R>`
    : 'No sessions recorded';
  
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${task.title}`)
    .setColor('#5865f2')
    .setDescription(task.description || 'No description')
    .addFields(
      { name: 'Priority', value: `${priority} ${task.priority}`, inline: true },
      { name: 'Category', value: `${category} ${task.category}`, inline: true },
      { name: 'Deadline', value: deadline, inline: true },
      { name: 'Status', value: task.status, inline: true },
      { name: 'Created', value: `<t:${Math.floor(new Date(task.createdAt).getTime()/1000)}:R>`, inline: true },
      { name: '⏱️ Time Spent', value: timeSpent, inline: false },
      { name: '📊 Session Info', value: `${task.timeLog.length} sessions recorded\n${lastSessionInfo}`, inline: false }
    )
    .setTimestamp();
  return embed;
}

// Export the function
export function createEditTaskModal(task) {
  const modal = new ModalBuilder()
    .setCustomId('edit_task_modal')
    .setTitle('Edit Task');

  const titleInput = new TextInputBuilder()
    .setCustomId('task_title')
    .setLabel('Task Title')
    .setStyle(TextInputStyle.Short)
    .setValue(task.title)
    .setRequired(true);

  const descriptionInput = new TextInputBuilder()
    .setCustomId('task_description')
    .setLabel('Description')
    .setStyle(TextInputStyle.Paragraph)
    .setValue(task.description || '')
    .setRequired(false);

  const categoryInput = new TextInputBuilder()
    .setCustomId('task_category')
    .setLabel('Category (Study, Work, Personal, Other)')
    .setStyle(TextInputStyle.Short)
    .setValue(task.category || 'Other')
    .setRequired(true);

  const priorityInput = new TextInputBuilder()
    .setCustomId('task_priority')
    .setLabel('Priority (high, medium, low)')
    .setStyle(TextInputStyle.Short)
    .setValue(task.priority || 'medium')
    .setRequired(true);

  const deadlineInput = new TextInputBuilder()
    .setCustomId('task_deadline')
    .setLabel('Deadline (YYYY-MM-DD)')
    .setStyle(TextInputStyle.Short)
    .setValue(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '')
    .setRequired(false);

  const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
  const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
  const thirdActionRow = new ActionRowBuilder().addComponents(categoryInput);
  const fourthActionRow = new ActionRowBuilder().addComponents(priorityInput);
  const fifthActionRow = new ActionRowBuilder().addComponents(deadlineInput);

  modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);
  return modal;
}

// Update handleTaskSelectMenu to use flags
export async function handleTaskSelectMenu(interaction) {
  try {
    const selectedTaskId = interaction.values[0];
    const userId = interaction.user.id;
    console.log(`[TASKS] User ${userId} selected task ${selectedTaskId} from select menu.`);
    
    // Fetch the task details
    const task = await Task.findById(selectedTaskId);
    if (!task) {
      console.log(`[TASKS] Task ${selectedTaskId} not found for user ${userId}`);
      await interaction.update({ content: 'Task not found.', components: [], flags: [MessageFlags.Ephemeral] });
      return;
    }

    console.log(`[TASKS] Found task ${task.title} for user ${userId} with status: ${task.status}`);
    
    // Check if task is being tracked
    const { getTracking } = await import('../../utils/tracking.js');
    const isTracking = getTracking(userId)?.taskId === selectedTaskId;
    console.log(`[TASKS] Task tracking status for ${task.title}: ${isTracking ? 'being tracked' : 'not tracked'}`);
    
    // Use the existing buildTaskDetailEmbed function to create the embed
    const embed = buildTaskDetailEmbed(task);
    const row = await getTaskActionButtons(task._id, isTracking);
    console.log(`[TASKS] Action buttons generated for ${task.title}:`, row ? 'success' : 'failed');
    
    try {
      await interaction.update({ embeds: [embed], components: row ? [row] : [], flags: [MessageFlags.Ephemeral] });
      console.log(`[TASKS] Successfully updated message with task details for ${task.title}`);
    } catch (updateError) {
      console.error('[TASKS] Error updating message:', updateError);
      // If update fails, try to reply instead
      await interaction.reply({ embeds: [embed], components: row ? [row] : [], flags: [MessageFlags.Ephemeral] });
      console.log(`[TASKS] Sent new message with task details for ${task.title}`);
    }
  } catch (error) {
    console.error('[TASKS] Error handling task select menu:', error);
    try {
      await interaction.update({ content: 'Error showing task details.', components: [], flags: [MessageFlags.Ephemeral] });
    } catch (updateError) {
      console.error('[TASKS] Error sending error message:', updateError);
      await interaction.reply({ content: 'Error showing task details.', flags: [MessageFlags.Ephemeral] });
    }
  }
}

// Handler for pagination button interactions
export async function handleTasksPagination(interaction) {
  try {
    const userId = interaction.user.id;
    const [ , , direction, sub ] = interaction.customId.split('_');
    let page = Number(interaction.message.embeds[0]?.footer?.text?.match(/Page (\d+) of (\d+)/)?.[1] || 1) - 1;
    let totalPages = Number(interaction.message.embeds[0]?.footer?.text?.match(/of (\d+)/)?.[1] || 1);
    console.log(`[PAGINATION] customId: ${interaction.customId}, userId: ${userId}, direction: ${direction}, sub: ${sub}, currentPage: ${page}, totalPages: ${totalPages}`);
    if (direction === 'next' && page < totalPages - 1) page++;
    if (direction === 'prev' && page > 0) page--;
    console.log(`[PAGINATION] After update: page: ${page}`);
    let tasks = [];
    let embed;
    if (sub === 'all') {
      tasks = await getUserTasks(userId, 'all');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '📋 All Tasks', 'all');
    } else if (sub === 'completed') {
      tasks = await getUserTasks(userId, 'completed');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '✅ Completed Tasks', 'completed');
    } else if (sub === 'pending') {
      tasks = await getUserTasks(userId, 'pending');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '⏳ Pending Tasks', 'pending');
    } else {
      tasks = await getUserTasks(userId, 'active');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '📝 Your Tasks', 'active');
    }
    const selectMenu = tasks.length > 0 ? new StringSelectMenuBuilder()
      .setCustomId('view_task_details')
      .setPlaceholder('Select a task to view details')
      .addOptions(tasks.map(task => ({
        label: task.title.length > 25 ? task.title.slice(0, 22) + '...' : task.title,
        value: task._id.toString()
      }))) : null;
    const row = selectMenu ? [new ActionRowBuilder().addComponents(selectMenu)] : [];
    if (['all', 'completed', 'pending', 'active'].includes(sub) && totalPages > 1) {
      row.push(getPaginationRow(page, totalPages, sub));
    }
    await interaction.update({
      embeds: [embed],
      components: row,
      flags: [MessageFlags.Ephemeral]
    });
  } catch (error) {
    console.error('[TASKS] Error in pagination:', error);
    await interaction.reply({ content: 'Error updating page.', flags: [MessageFlags.Ephemeral] });
  }
} 