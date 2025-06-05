import { Events, MessageFlags } from 'discord.js';
import { handleTasksPagination, handleTaskSelectMenu } from '../commands/tasks/index.js';

export const name = Events.InteractionCreate;
export const once = false;

export async function execute(interaction) {
  console.log('[EVENT] interactionCreate event fired');
  console.log('[EVENT] Interaction type:', interaction.type);
  console.log('[EVENT] Interaction command:', interaction.commandName);
  console.log('[EVENT] Interaction user:', interaction.user.id);
  
  try {
    // Handle commands first
    if (interaction.isChatInputCommand()) {
      console.log('[COMMAND] Received command:', interaction.commandName);
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) {
        console.error(`[COMMAND] No command matching ${interaction.commandName} was found.`);
        return;
      }
      try {
        console.log('[COMMAND] Executing command:', interaction.commandName);
        await command.execute(interaction);
        console.log('[COMMAND] Command execution completed:', interaction.commandName);
      } catch (error) {
        console.error(`[COMMAND] Error executing ${interaction.commandName}:`, error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
        }
      }
      return;
    }

    // Handle select menus for task creation and /tasks
    if (interaction.isStringSelectMenu()) {
      console.log('[SELECT MENU] customId:', interaction.customId, 'userId:', interaction.user.id, 'values:', interaction.values);
      // /tasks select menu handler
      if (interaction.customId === 'view_task_details') {
        console.log('[SELECT MENU] Handling task selection for user:', interaction.user.id);
        await handleTaskSelectMenu(interaction);
        return;
      }
      // Handle select menus for task creation
      const userId = interaction.user.id;
      if (!global.taskCreationData) global.taskCreationData = {};
      if (!global.taskCreationData[userId]) return;
      if (interaction.customId === 'select_category') {
        global.taskCreationData[userId].category = interaction.values[0];
        await interaction.deferUpdate();
        return;
      } else if (interaction.customId === 'select_priority') {
        global.taskCreationData[userId].priority = interaction.values[0];
        await interaction.deferUpdate();
        return;
      }
    }
    // Handle submit button for task creation
    if (interaction.isButton() && interaction.customId === 'submit_task_creation') {
      try {
        const userId = interaction.user.id;
        const data = global.taskCreationData && global.taskCreationData[userId];
        if (!data) {
          if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
              content: 'Session expired. Please try creating the task again.',
              flags: [MessageFlags.Ephemeral]
            });
          }
          return;
        }
        const category = data.category && data.category !== 'skip' ? data.category : 'Other';
        const priority = data.priority && data.priority !== 'skip' ? data.priority : 'medium';
        const { Task } = await import('../db/task.js');
        const { UserTodo } = await import('../db/userTodo.js');
        const newTask = new Task({
          title: data.title,
          description: data.description,
          category,
          priority,
          deadline: data.deadline,
          status: 'active'
        });
        await newTask.save();
        const userTodo = await UserTodo.findOrCreate(userId);
        await userTodo.addTask(newTask._id);
        // Clean up
        delete global.taskCreationData[userId];
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Task created successfully!', flags: [MessageFlags.Ephemeral] });
        }
      } catch (error) {
        console.error('[TODO] Error in final task creation:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error creating your task. Please try again.', flags: [MessageFlags.Ephemeral] });
        }
      }
      return;
    }
    // Handle modal submission for create_task_modal
    if (interaction.isModalSubmit() && interaction.customId === 'create_task_modal') {
      try {
        const title = interaction.fields.getTextInputValue('task_title');
        const description = interaction.fields.getTextInputValue('task_description');
        const deadlineStr = interaction.fields.getTextInputValue('task_deadline');
        let deadline = null;
        if (deadlineStr) {
          const parsedDate = new Date(deadlineStr);
          if (isNaN(parsedDate.getTime())) {
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: 'Invalid date format. Please use YYYY-MM-DD.', flags: [MessageFlags.Ephemeral] });
            }
            return;
          }
          deadline = parsedDate;
        }
        // Prompt for category and priority
        const { StringSelectMenuBuilder, ButtonBuilder, ActionRowBuilder } = await import('discord.js');
        const categorySelect = new StringSelectMenuBuilder()
          .setCustomId('select_category')
          .setPlaceholder('Select a category (optional)')
          .addOptions([
            { label: 'Skip', value: 'skip' },
            { label: 'Study', value: 'Study' },
            { label: 'Work', value: 'Work' },
            { label: 'Personal', value: 'Personal' },
            { label: 'Other', value: 'Other' }
          ]);
        const prioritySelect = new StringSelectMenuBuilder()
          .setCustomId('select_priority')
          .setPlaceholder('Select priority (optional)')
          .addOptions([
            { label: 'Skip', value: 'skip' },
            { label: 'Low', value: 'low' },
            { label: 'Medium', value: 'medium' },
            { label: 'High', value: 'high' }
          ]);
        const submitButton = new ButtonBuilder()
          .setCustomId('submit_task_creation')
          .setLabel('Submit')
          .setStyle(3); // Success
        const row1 = new ActionRowBuilder().addComponents(categorySelect);
        const row2 = new ActionRowBuilder().addComponents(prioritySelect);
        const row3 = new ActionRowBuilder().addComponents(submitButton);
        if (!global.taskCreationData) global.taskCreationData = {};
        global.taskCreationData[interaction.user.id] = { title, description, deadline };
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Optionally select a category and priority for your task, then click Submit.',
            components: [row1, row2, row3],
            flags: [MessageFlags.Ephemeral]
          });
        }
      } catch (error) {
        console.error('[TODO] Error in modal submit:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error creating your task. Please try again.', flags: [MessageFlags.Ephemeral] });
        }
      }
      return;
    }
    // Handle create_task button to show the task creation modal
    if (interaction.isButton() && interaction.customId === 'create_task') {
      try {
        const { createTaskModal } = await import('../commands/todo.js');
        await interaction.showModal(createTaskModal());
        return;
      } catch (error) {
        console.error('[TODO] Error showing create task modal:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Failed to show create task modal.', flags: [MessageFlags.Ephemeral] });
        }
        return;
      }
    }
    // Handle pagination buttons before task action buttons
    if (interaction.isButton() && (interaction.customId === 'prev_page' || interaction.customId === 'next_page')) {
      const userId = interaction.user.id;
      if (!global.todoDashboardState) global.todoDashboardState = {};
      if (!global.todoDashboardState[userId]) {
        global.todoDashboardState[userId] = { page: 0, filters: {} };
      }
      let { page, filters } = global.todoDashboardState[userId];
      const increment = interaction.customId === 'next_page' ? 1 : -1;
      page = Math.max(0, page + increment);
      const { createTaskEmbed } = await import('../commands/todo.js');
      const { ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, MessageFlags } = await import('discord.js');
      const { embed, tasks, totalTasks, currentPage, totalPages } = await createTaskEmbed(userId, 'default', filters, page);
      global.todoDashboardState[userId].page = currentPage;
      // Row 1: Create Task button
      const row1 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('create_task')
            .setLabel('New Task')
            .setStyle(1)
            .setEmoji('🆕')
        );
      // Row 2: Pagination buttons
      const row2 = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('prev_page')
            .setLabel(' ')
            .setEmoji('◀️')
            .setStyle(2)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId('next_page')
            .setLabel(' ')
            .setEmoji('▶️')
            .setStyle(2)
            .setDisabled(currentPage === totalPages - 1)
        );
      await interaction.update({
        embeds: [embed],
        components: [row1, row2],
        flags: [MessageFlags.Ephemeral]
      });
      return;
    }
    // Handle /tasks pagination buttons
    if (interaction.isButton() && interaction.customId.startsWith('tasks_page_')) {
      await handleTasksPagination(interaction);
      return;
    }
    // Handle /task command buttons
    if (interaction.isButton()) {
      try {
        const userId = interaction.user.id;
        const [action, ...rest] = interaction.customId.split('_');
        const taskId = rest.pop();
        if (!taskId || !taskId.match(/^[a-f\d]{24}$/i)) {
          await interaction.reply({ content: 'Invalid task ID.', flags: [MessageFlags.Ephemeral] });
          return;
        }
        const task = await (await import('../db/task.js')).Task.findById(taskId);
        if (!task) {
          await interaction.reply({ content: 'Task not found.', flags: [MessageFlags.Ephemeral] });
          return;
        }
        // Optionally, check if the user owns this task (if you store userId on Task)
        // if (task.userId !== userId) { ... }
        if (action === 'hold') {
          task.status = 'held';
          await task.save();
          await interaction.reply({ content: 'Task is now on hold.', flags: [MessageFlags.Ephemeral] });
          console.log(`[TASK] Task ${taskId} held by user ${userId}`);
        } else if (action === 'abandon') {
          task.status = 'abandoned';
          await task.save();
          // Optionally remove from user's todo list
          try {
            const { UserTodo } = await import('../db/userTodo.js');
            const userTodo = await UserTodo.findOne({ userId });
            if (userTodo) await userTodo.removeTask(taskId);
          } catch (err) {
            console.error('[TASK] Error removing abandoned task from userTodo:', err);
          }
          await interaction.reply({ content: 'Task abandoned.', flags: [MessageFlags.Ephemeral] });
          console.log(`[TASK] Task ${taskId} abandoned by user ${userId}`);
        } else if (action === 'edit') {
          try {
            const { createEditTaskModal } = await import('../commands/task.js');
            await interaction.showModal(createEditTaskModal(task));
            console.log(`[TASK] Edit modal shown for task ${taskId} by user ${userId}`);
          } catch (err) {
            console.error('[TASK] Error showing edit modal:', err);
            await interaction.reply({ content: 'Failed to show edit modal.', flags: [MessageFlags.Ephemeral] });
          }
          return;
        } else if (action === 'start' || action === 'stop') {
          try {
            const { startTracking, stopTracking, getTracking } = await import('../utils/tracking.js');
            const member = await interaction.guild.members.fetch(userId);
            const voiceChannelId = member.voice?.channelId;
            if (action === 'start') {
              if (!voiceChannelId) {
                await interaction.reply({ content: 'You must be in a voice channel to start tracking.', flags: [MessageFlags.Ephemeral] });
                console.log(`[TRACKING] User ${userId} tried to start tracking outside VC.`);
                return;
              }
              // Only allow one active tracked task per user
              if (getTracking(userId)) {
                await interaction.reply({ content: 'You are already tracking another task. Stop it first.', flags: [MessageFlags.Ephemeral] });
                console.log(`[TRACKING] User ${userId} tried to start multiple tracking sessions.`);
                return;
              }
              startTracking(userId, taskId, voiceChannelId);
              await interaction.reply({ content: `Started tracking this task in <#${voiceChannelId}>. Tracking will stop automatically when you leave the channel or press Stop.`, flags: [MessageFlags.Ephemeral] });
            } else if (action === 'stop') {
              const session = stopTracking(userId);
              if (!session) {
                await interaction.reply({ content: 'No active tracking session found.', flags: [MessageFlags.Ephemeral] });
                console.log(`[TRACKING] User ${userId} tried to stop tracking without an active session.`);
                return;
              }
              await interaction.reply({ content: 'Tracking stopped.', flags: [MessageFlags.Ephemeral] });
              console.log(`[TRACKING] User ${userId} stopped tracking session ${session}`);
            }
          } catch (error) {
            console.error('[TRACKING] Error in tracking:', error);
            if (!interaction.replied && !interaction.deferred) {
              await interaction.reply({ content: 'There was an error stopping tracking. Please try again later.', flags: [MessageFlags.Ephemeral] });
            }
          }
        }
      } catch (error) {
        console.error('[TODO] Error in task command:', error);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'There was an error processing the task command. Please try again later.', flags: [MessageFlags.Ephemeral] });
        }
      }
    }
  } catch (error) {
    console.error('[TODO] Error in interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'There was an error processing the interaction. Please try again later.', flags: [MessageFlags.Ephemeral] });
    }
  }
}