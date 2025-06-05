import { SlashCommandBuilder, StringSelectMenuBuilder, ActionRowBuilder, MessageFlags, EmbedBuilder, ButtonBuilder } from 'discord.js';
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
  const userTodo = await UserTodo.findOrCreate(userId);
  let taskIds = [];
  if (status === 'active' || status === 'pending') {
    taskIds = userTodo.activeTasks;
  } else if (status === 'completed') {
    taskIds = userTodo.completedTasks;
  } else {
    taskIds = [...userTodo.activeTasks, ...userTodo.completedTasks];
  }
  let query = { _id: { $in: taskIds } };
  if (status === 'pending') {
    query.status = { $in: ['active', 'held'] };
  } else if (status === 'completed') {
    query.status = 'completed';
  } else if (status === 'active') {
    query.status = 'active';
  }
  const tasks = await Task.find(query).sort({ createdAt: -1 });
  return tasks;
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
    let page = 0;
    if (interaction.options.getInteger('page')) page = interaction.options.getInteger('page');
    let tasks = [];
    let embed;
    let totalPages = 1;
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
    } else if (sub === 'view') {
      const name = interaction.options.getString('name');
      const matches = await fuzzySearchTasks(userId, name, 'all');
      if (matches.length === 0) {
        await interaction.reply({ content: 'No tasks found matching that name.', flags: [MessageFlags.Ephemeral] });
        return;
      } else if (matches.length === 1) {
        embed = buildTaskDetailEmbed(matches[0]);
        await interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
        return;
      } else {
        // Paginate and let user select from matches
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('view_task_details')
          .setPlaceholder('Multiple tasks found. Select one to view details.')
          .addOptions(matches.slice(0, 25).map(task => ({
            label: task.title.length > 25 ? task.title.slice(0, 22) + '...' : task.title,
            value: task._id.toString()
          })));
        const row = new ActionRowBuilder().addComponents(selectMenu);
        await interaction.reply({ content: 'Multiple tasks found. Select one:', components: [row], flags: [MessageFlags.Ephemeral] });
        return;
      }
    } else if (sub === 'track') {
      const name = interaction.options.getString('name');
      const matches = await fuzzySearchTasks(userId, name, 'all');
      if (matches.length === 0) {
        await interaction.reply({ content: 'No tasks found matching that name.', flags: [MessageFlags.Ephemeral] });
        return;
      }
      // TODO: Check if user is in a voice channel
      // TODO: Start tracking logic
      await interaction.reply({ content: `Started tracking: ${matches[0].title} (placeholder)`, flags: [MessageFlags.Ephemeral] });
      return;
    } else {
      // Default: show only active tasks
      tasks = await getUserTasks(userId, 'active');
      ({ paginatedTasks: tasks, totalPages } = paginate(tasks, page, 5));
      embed = buildTasksEmbed(tasks, page, totalPages, '📝 Your Tasks', 'active');
    }
    // For list views (active, completed, pending, all)
    if (!embed) embed = buildTasksEmbed(tasks, page, totalPages, '📝 Your Tasks', 'active');
    const selectMenu = tasks.length > 0 ? new StringSelectMenuBuilder()
      .setCustomId('view_task_details')
      .setPlaceholder('Select a task to view details')
      .addOptions(tasks.map(task => ({
        label: task.title.length > 25 ? task.title.slice(0, 22) + '...' : task.title,
        value: task._id.toString()
      }))) : null;
    const row = selectMenu ? [new ActionRowBuilder().addComponents(selectMenu)] : [];
    // Add pagination row for list views
    if (['all', 'completed', 'pending', 'active'].includes(sub) && totalPages > 1) {
      row.push(getPaginationRow(page, totalPages, sub));
    }
    await interaction.reply({
      embeds: [embed],
      components: row,
      flags: [MessageFlags.Ephemeral]
    });
  } catch (error) {
    console.error('[TASKS] Error in /tasks:', error);
    await interaction.reply({ content: 'Error loading tasks.', flags: [MessageFlags.Ephemeral] });
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

function buildTaskDetailEmbed(task) {
  const priority = PRIORITY_EMOJI[task.priority] || '';
  const category = CATEGORY_EMOJI[task.category] || '';
  const deadline = task.deadline ? `<t:${Math.floor(new Date(task.deadline).getTime()/1000)}:D>` : 'No deadline';
  const embed = new EmbedBuilder()
    .setTitle(`🔍 ${task.title}`)
    .setColor('#5865f2')
    .setDescription(task.description || 'No description')
    .addFields(
      { name: 'Priority', value: `${priority} ${task.priority}`, inline: true },
      { name: 'Category', value: `${category} ${task.category}`, inline: true },
      { name: 'Deadline', value: deadline, inline: true },
      { name: 'Status', value: task.status, inline: true },
      { name: 'Created', value: `<t:${Math.floor(new Date(task.createdAt).getTime()/1000)}:R>`, inline: true }
    )
    .setTimestamp();
  return embed;
}

// Handler for select menu interaction (to be used in your interactionCreate event)
export async function handleTaskSelectMenu(interaction) {
  try {
    const selectedTaskId = interaction.values[0];
    const userId = interaction.user.id;
    console.log(`[TASKS] User ${userId} selected task ${selectedTaskId} from select menu.`);
    // TODO: Fetch and display detailed view for the selected task
    await interaction.reply({ content: `You selected task ID: ${selectedTaskId}`, flags: [MessageFlags.Ephemeral] });
  } catch (error) {
    console.error('[TASKS] Error handling task select menu:', error);
    await interaction.reply({ content: 'Error showing task details.', flags: [MessageFlags.Ephemeral] });
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