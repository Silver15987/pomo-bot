const { REST, Routes, SlashCommandBuilder } = require('discord.js');

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

    const commands = [
        new SlashCommandBuilder()
            .setName('assignroles')
            .setDescription('Track a message for reaction-based team role assignment.')
            .addStringOption(option =>
                option.setName('channel')
                    .setDescription('Channel ID of the message')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option.setName('message')
                    .setDescription('Message ID to track')
                    .setRequired(true)
            )
            .toJSON()
    ];

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
