const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId, token } = require('../config/bot-config.json');
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
            .toJSON(),
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('Shows the top 10 users with the highest VC points')
            .toJSON(),
        new SlashCommandBuilder()
            .setName('setmultiplier')
            .setDescription('Set the points multiplier for VC time (admin only)')
            .addNumberOption(option =>
                option.setName('multiplier')
                    .setDescription('Points multiplier per hour (e.g., 2 means 2 points per hour)')
                    .setRequired(true)
                    .setMinValue(0.1)
                    .setMaxValue(10)
            )
            .toJSON(),
        new SlashCommandBuilder()
            .setName('clearleaderboard')
            .setDescription('Clear all VC points from the leaderboard (admin only)')
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
