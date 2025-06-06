/**
 * Build a detailed embed for a task, including session info.
 * @param {Object} task
 * @param {Array} sessions
 * @returns {Object} Discord embed object (placeholder)
 */
export function buildTaskDetailsEmbed(task, sessions = []) {
  // TODO: Replace with actual Discord.EmbedBuilder usage
  return {
    title: task.title,
    description: task.description || 'No description',
    fields: [
      { name: 'Status', value: task.status || 'unknown', inline: true },
      { name: 'Category', value: task.category || 'none', inline: true },
      { name: 'Priority', value: task.priority || 'none', inline: true },
      // TODO: Add more fields (deadline, completion, etc.)
      { name: 'Sessions', value: sessions.length ? `${sessions.length} sessions` : 'No sessions' }
    ]
  };
} 