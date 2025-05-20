const { REST, Routes, SlashCommandBuilder } = require('discord.js');

async function registerCommands() {
    const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
    const GUILD_ID = process.env.DISCORD_GUILD_ID;
    const TOKEN = process.env.DISCORD_BOT_TOKEN;

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
    } catch (err) {
        console.error('Error registering commands:', err);
    }
}

module.exports = registerCommands;
