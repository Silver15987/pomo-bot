const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

let hasAttemptedRegistration = false;

async function registerCommands() {
    // Prevent multiple registration attempts
    if (hasAttemptedRegistration) {
        console.log('Command registration already attempted, skipping...');
        return false;
    }
    hasAttemptedRegistration = true;

    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const GUILD_ID = process.env.DISCORD_GUILD_ID;
    const TOKEN = process.env.DISCORD_BOT_TOKEN;

    if (!CLIENT_ID || !GUILD_ID || !TOKEN) {
        console.error('Missing required environment variables for command registration');
        return false;
    }

    const commands = [];
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
            console.log(`Loaded command: ${command.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    const rest = new REST({ version: '10' }).setToken(TOKEN);

    try {
        console.log('Registering slash commands...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
            { body: commands }
        );
        console.log('Slash commands registered successfully.');
        return true;
    } catch (err) {
        console.error('Error registering commands:', err.message);
        // Don't throw the error, just return false
        return false;
    }
}

module.exports = registerCommands;
