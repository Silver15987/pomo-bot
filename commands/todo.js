import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } from 'discord.js';
import { UserTodo } from '../db/userTodo.js';
import { Task } from '../db/task.js';
import { User } from '../db/user.js';

export const data = new SlashCommandBuilder()
  .setName('todo')
  .setDescription('Manage your to-do list')
  .addSubcommand(sub =>
    sub.setName('dashboard')
      .setDescription('View and manage your to-do list')
  )
  .addSubcommand(sub =>
    sub.setName('reminders')
      .setDescription('Enable or disable deadline reminders')
      .addBooleanOption(opt =>
        opt.setName('enabled')
          .setDescription('Enable reminders?')
          .setRequired(true)
      )
  );

// Helper function to create the task creation modal (no category/priority)
function createTaskModal() {
  try {
    console.log('[TODO] Creating task modal');
    const modal = new ModalBuilder()
      .setCustomId('create_task_modal')
      .setTitle('Create New Task');

    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('task_title')
      .setLabel('Task Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter task title')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(100);

    // Description input
    const descriptionInput = new TextInputBuilder()
      .setCustomId('task_description')
      .setLabel('Description (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter task description')
      .setRequired(false)
      .setMaxLength(1000);

    // Deadline input
    const deadlineInput = new TextInputBuilder()
      .setCustomId('task_deadline')
      .setLabel('Deadline (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('YYYY-MM-DD')
      .setRequired(false);

    // Add inputs to modal
    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(deadlineInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow);
    console.log('[TODO] Task modal created successfully');
    return modal;
  } catch (error) {
    console.error('[TODO] Error creating task modal:', error);
    throw error;
  }
}

// Helper function to validate category
function validateCategory(category) {
  try {
    console.log(`[TODO] Validating category: ${category}`);
    const validCategories = ['Study', 'Work', 'Personal', 'Other'];
    const isValid = validCategories.includes(category);
    console.log(`[TODO] Category validation result: ${isValid}`);
    return isValid;
  } catch (error) {
    console.error('[TODO] Error validating category:', error);
    throw error;
  }
}

// Helper function to validate priority
function validatePriority(priority) {
  try {
    console.log(`[TODO] Validating priority: ${priority}`);
    const validPriorities = ['low', 'medium', 'high'];
    const isValid = validPriorities.includes(priority.toLowerCase());
    console.log(`[TODO] Priority validation result: ${isValid}`);
    return isValid;
  } catch (error) {
    console.error('[TODO] Error validating priority:', error);
    throw error;
  }
}

// Helper function to sort tasks
function sortTasks(tasks, sortBy) {
  try {
    console.log(`[TODO] Sorting tasks by: ${sortBy}`);
    let sortedTasks;
    switch (sortBy) {
      case 'priority':
        sortedTasks = [...tasks].sort((a, b) => {
          const priorityOrder = { high: 3, medium: 2, low: 1 };
          return priorityOrder[b.priority] - priorityOrder[a.priority];
        });
        break;
      case 'deadline':
        sortedTasks = [...tasks].sort((a, b) => {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return new Date(a.deadline) - new Date(b.deadline);
        });
        break;
      default: // 'default' or any other value
        sortedTasks = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
    }
    console.log(`[TODO] Successfully sorted ${sortedTasks.length} tasks`);
    return sortedTasks;
  } catch (error) {
    console.error('[TODO] Error sorting tasks:', error);
    throw error;
  }
}

// Helper function to create task action buttons
function createTaskActionButtons(taskId) {
  try {
    console.log(`[TODO] Creating action buttons for task: ${taskId}`);
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`complete_${taskId}`)
          .setLabel('Complete')
          .setStyle(ButtonStyle.Success)
          .setEmoji('✅'),
        new ButtonBuilder()
          .setCustomId(`hold_${taskId}`)
          .setLabel('Hold')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏸️'),
        new ButtonBuilder()
          .setCustomId(`abandon_${taskId}`)
          .setLabel('Abandon')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('❌'),
        new ButtonBuilder()
          .setCustomId(`edit_${taskId}`)
          .setLabel('Edit')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('✏️')
      );
    console.log('[TODO] Action buttons created successfully');
    return row;
  } catch (error) {
    console.error('[TODO] Error creating task action buttons:', error);
    throw error;
  }
}

// Helper function to create edit task modal
function createEditTaskModal(task) {
  try {
    console.log(`[TODO] Creating edit modal for task: ${task._id}`);
    const modal = new ModalBuilder()
      .setCustomId(`edit_task_modal_${task._id}`)
      .setTitle('Edit Task');

    // Title input
    const titleInput = new TextInputBuilder()
      .setCustomId('edit_task_title')
      .setLabel('Task Title')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Enter task title')
      .setRequired(true)
      .setValue(task.title);

    // Description input
    const descriptionInput = new TextInputBuilder()
      .setCustomId('edit_task_description')
      .setLabel('Description (Optional)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Enter task description')
      .setRequired(false)
      .setValue(task.description || '');

    // Category input
    const categoryInput = new TextInputBuilder()
      .setCustomId('edit_task_category')
      .setLabel('Category')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('Study, Work, Personal, or Other')
      .setRequired(true)
      .setValue(task.category);

    // Priority input
    const priorityInput = new TextInputBuilder()
      .setCustomId('edit_task_priority')
      .setLabel('Priority')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('low, medium, or high')
      .setRequired(true)
      .setValue(task.priority);

    // Deadline input
    const deadlineInput = new TextInputBuilder()
      .setCustomId('edit_task_deadline')
      .setLabel('Deadline (Optional)')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('YYYY-MM-DD')
      .setRequired(false)
      .setValue(task.deadline ? new Date(task.deadline).toISOString().split('T')[0] : '');

    // Add inputs to modal
    const firstActionRow = new ActionRowBuilder().addComponents(titleInput);
    const secondActionRow = new ActionRowBuilder().addComponents(descriptionInput);
    const thirdActionRow = new ActionRowBuilder().addComponents(categoryInput);
    const fourthActionRow = new ActionRowBuilder().addComponents(priorityInput);
    const fifthActionRow = new ActionRowBuilder().addComponents(deadlineInput);

    modal.addComponents(firstActionRow, secondActionRow, thirdActionRow, fourthActionRow, fifthActionRow);
    console.log('[TODO] Edit modal created successfully');
    return modal;
  } catch (error) {
    console.error('[TODO] Error creating edit task modal:', error);
    throw error;
  }
}

// Helper function to filter tasks
function filterTasks(tasks, filters) {
  try {
    console.log('[TODO] Filtering tasks with filters:', filters);
    const filteredTasks = tasks.filter(task => {
      if (filters.category && task.category !== filters.category) return false;
      if (filters.priority && task.priority !== filters.priority) return false;
      if (filters.status && task.status !== filters.status) return false;
      return true;
    });
    console.log(`[TODO] Filtered ${tasks.length} tasks down to ${filteredTasks.length} tasks`);
    return filteredTasks;
  } catch (error) {
    console.error('[TODO] Error filtering tasks:', error);
    throw error;
  }
}

// Helper function to paginate task action rows
function paginateTaskActionRows(tasks, pageSize = 5) {
  const rows = [];
  for (let i = 0; i < tasks.length; i += pageSize) {
    const pageTasks = tasks.slice(i, i + pageSize);
    const row = new ActionRowBuilder()
      .addComponents(
        pageTasks.map(task => 
          new ButtonBuilder()
            .setCustomId(`task_${task._id}`)
            .setLabel(task.title.length > 20 ? task.title.substring(0, 17) + '...' : task.title)
            .setStyle(ButtonStyle.Primary)
        )
      );
    rows.push(row);
  }
  return rows;
}

// Update createTaskEmbed to include pagination
async function createTaskEmbed(userId, sortBy = 'default', filters = {}, page = 0) {
  try {
    console.log(`[TODO] Creating task embed for user ${userId} with sort: ${sortBy} and filters:`, filters);
    const userTodo = await UserTodo.findOrCreate(userId);
    const activeTasks = await Task.find({
      _id: { $in: userTodo.activeTasks }
    });

    // Apply filters first, then sort
    const filteredTasks = filterTasks(activeTasks, filters);
    const sortedTasks = sortTasks(filteredTasks, sortBy);

    // Calculate pagination
    const tasksPerPage = 5;
    const totalPages = Math.ceil(sortedTasks.length / tasksPerPage);
    const startIndex = page * tasksPerPage;
    const endIndex = startIndex + tasksPerPage;
    const pageTasks = sortedTasks.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setColor('#0099ff')
      .setTitle('📝 Your To-Do List')
      .setDescription(`Manage your tasks here (Sorted by: ${sortBy}${Object.keys(filters).length ? ` | Filtered` : ''})`)
      .setFooter({ 
        text: `Page ${page + 1}/${totalPages} | Total Active Tasks: ${sortedTasks.length}` 
      })
      .setTimestamp();

    if (sortedTasks.length === 0) {
      embed.addFields({ name: 'No Active Tasks', value: 'Use the Create Task button to add a new task!' });
    } else {
      pageTasks.forEach((task, index) => {
        const deadline = task.deadline ? new Date(task.deadline).toLocaleDateString() : 'No deadline';
        const priorityEmoji = {
          high: '🔴',
          medium: '🟡',
          low: '🟢'
        }[task.priority];
        
        embed.addFields({
          name: `${startIndex + index + 1}. ${task.title}`,
          value: `Category: ${task.category}\nPriority: ${priorityEmoji} ${task.priority}\nDeadline: ${deadline}`
        });
      });
    }

    console.log('[TODO] Task embed created successfully');
    return { 
      embed, 
      tasks: pageTasks,
      totalTasks: sortedTasks,
      currentPage: page,
      totalPages
    };
  } catch (error) {
    console.error('[TODO] Error creating task embed:', error);
    throw error;
  }
}

export async function execute(interaction) {
  try {
    const sub = interaction.options.getSubcommand();
    if (sub === 'reminders') {
      const enabled = interaction.options.getBoolean('enabled');
      let user = await User.findOne({ userId: interaction.user.id });
      if (!user) user = await User.create({ userId: interaction.user.id });
      user.remindersEnabled = enabled;
      await user.save();
      await interaction.reply({ content: `Deadline reminders are now ${enabled ? 'enabled' : 'disabled'}.`, flags: [MessageFlags.Ephemeral] });
      console.log(`[REMINDER] User ${interaction.user.id} set reminders to ${enabled}`);
      return;
    }
    // Default: dashboard logic
    console.log(`[TODO] /todo command invoked by user ${interaction.user.id}`);
    // Get or create user's todo list
    const userTodo = await UserTodo.findOrCreate(interaction.user.id);
    console.log(`[TODO] Retrieved todo list for user ${interaction.user.id}`);
    
    // Initialize filters and pagination
    let currentFilters = {};
    let currentPage = 0;
    
    // Create the main embed with default sorting and no filters
    const { embed, tasks, totalTasks, currentPage: page, totalPages } = await createTaskEmbed(interaction.user.id);
    console.log(`[TODO] Created initial embed with ${tasks.length} tasks`);

    // Row 1: Create Task button
    const row1 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('create_task')
          .setLabel('New Task')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🆕')
      );
    // Row 2: Pagination buttons
    const row2 = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('prev_page')
          .setLabel(' ')
          .setEmoji('◀️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('next_page')
          .setLabel(' ')
          .setEmoji('▶️')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === totalPages - 1)
      );

    // Send the initial message
    const response = await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      flags: [MessageFlags.Ephemeral]
    });
    console.log('[TODO] Initial message sent successfully');

  } catch (error) {
    console.error('[TODO] Error in todo command:', error);
    await interaction.reply({
      content: 'There was an error while fetching your todo list!',
      flags: [MessageFlags.Ephemeral]
    });
  }
}

export { createTaskModal, createTaskEmbed }; 