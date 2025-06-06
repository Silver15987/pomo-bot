import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readdirSync, statSync } from 'fs';
import { connectDB } from './db/mongoose.js';
import { checkAndSendReminders } from './utils/reminders.js';
import { startEventStatsCron } from './utils/cronJobs.js';

// Load environment variables
config();

// Get current file path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Discord client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Initialize collections
client.commands = new Collection();
client.cooldowns = new Collection();

// Helper function to recursively get all .js files in a directory
function getAllCommandFiles(dir) {
  let results = [];
  const list = readdirSync(dir);
  for (const file of list) {
    const filePath = join(dir, file);
    if (statSync(filePath).isDirectory()) {
      results = results.concat(getAllCommandFiles(filePath));
    } else if (file.endsWith('.js')) {
      results.push(filePath);
    }
  }
  return results;
}

// Function to register commands
async function registerCommands() {
  const commands = [];
  const commandsPath = join(__dirname, 'commands');
  const commandFiles = getAllCommandFiles(commandsPath);

  console.log('\n=== Loading Commands ===');
  console.log(`Found ${commandFiles.length} command files`);
  
  for (const filePath of commandFiles) {
    const importPath = `file://${filePath.replace(/\\/g, '/')}`;
    console.log(`Loading command from: ${filePath}`);
    try {
      const command = await import(importPath);
      if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        const commandData = command.data.toJSON();
        commands.push(commandData);
        console.log(`✓ Loaded command: ${commandData.name}`);
      } else {
        console.warn(`⚠️ The command at ${importPath} is missing a required "data" or "execute" property.`);
      }
    } catch (error) {
      console.error(`Error loading command from ${filePath}:`, error);
    }
  }
  console.log('=====================\n');

  try {
    console.log('=== Registering Guild Commands with Discord ===');
    const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);

    // Register guild commands
    console.log(`Registering ${commands.length} commands for guild ${process.env.GUILD_ID}`);
    const data = await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
      { body: commands },
    );

    console.log(`Successfully registered ${data.length} guild commands`);
    data.forEach(cmd => console.log(`✓ /${cmd.name}`));
    console.log('=======================================\n');
  } catch (error) {
    console.error('Error registering guild commands:', error);
    if (error.code === 50035) {
      console.error('This usually means the bot token, client ID, or guild ID is incorrect.');
    }
  }
}

// Function to clear all global commands
async function clearGlobalCommands() {
  const rest = new REST().setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('Clearing all global commands...');
    await rest.put(
      Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
      { body: [] }
    );
    console.log('All global commands cleared!');
  } catch (error) {
    console.error('Error clearing global commands:', error);
  }
}

// Load events
const eventsPath = join(__dirname, 'events');
const eventFiles = readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = `file://${join(eventsPath, file).replace(/\\/g, '/')}`;
  const event = await import(filePath);
  
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

// Error handling
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// After client is created, before login
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Start event stats cronjob
  startEventStatsCron();
  
  // Schedule reminders every hour
  setInterval(async () => {
    try {
      console.log('[REMINDER] Checking for upcoming deadlines...');
      await checkAndSendReminders(client);
    } catch (err) {
      console.error('[REMINDER] Error in scheduled reminder check:', err);
    }
  }, 60 * 60 * 1000); // every hour
});

// Connect to MongoDB and then start the bot
(async () => {
  try {
    // First connect to MongoDB
    await connectDB();
    console.log('Connected to MongoDB');

    // Always register commands
    console.log('\n=== Registering Commands ===');
    console.log('Registering commands...');
    await registerCommands();
    console.log('Commands registered successfully');

    // Finally start the bot
    await client.login(process.env.DISCORD_BOT_TOKEN);
    console.log('Bot is online!');
  } catch (error) {
    console.error('Error during startup:', error);
    process.exit(1);
  }
})(); 