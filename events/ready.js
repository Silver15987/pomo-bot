import { Events } from 'discord.js';

export const name = Events.ClientReady;
export const once = true;

export function execute(client) {
  console.log(`Ready! Logged in as ${client.user.tag}`);
  console.log(`Bot is in ${client.guilds.cache.size} guilds`);
  
  // Set bot status
  client.user.setPresence({
    activities: [{ name: '/help | v1.0.0' }],
    status: 'online'
  });
} 