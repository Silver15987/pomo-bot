import { User } from '../db/user.js';
import { UserTodo } from '../db/userTodo.js';
import { Task } from '../db/task.js';

/**
 * Checks for tasks with deadlines in the next 24 hours and sends reminders to users.
 * @param {import('discord.js').Client} client
 */
export async function checkAndSendReminders(client) {
  try {
    const now = new Date();
    const soon = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    // Find all users with reminders enabled
    const users = await User.find({ remindersEnabled: true });
    for (const user of users) {
      try {
        const userTodo = await UserTodo.findOne({ userId: user.userId });
        if (!userTodo) continue;
        const tasks = await Task.find({ _id: { $in: userTodo.activeTasks }, status: 'active', deadline: { $gte: now, $lte: soon } });
        if (tasks.length === 0) continue;
        // Build reminder message
        const lines = tasks.map(task => `• **${task.title}** (due <t:${Math.floor(new Date(task.deadline).getTime()/1000)}:R>)`).join('\n');
        const message = `⏰ You have task deadlines approaching in the next 24 hours:\n${lines}`;
        // Try to DM the user
        const discordUser = await client.users.fetch(user.userId).catch(() => null);
        if (discordUser) {
          await discordUser.send(message);
          console.log(`[REMINDER] Sent DM to user ${user.userId}`);
        } else {
          console.warn(`[REMINDER] Could not DM user ${user.userId}`);
        }
      } catch (err) {
        console.error('[REMINDER] Error sending reminder to user:', user.userId, err);
      }
    }
  } catch (error) {
    console.error('[REMINDER] Error in checkAndSendReminders:', error);
  }
} 