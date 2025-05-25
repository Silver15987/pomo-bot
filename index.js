require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const express = require('express');

const { setupVoiceHandler, getActiveVC } = require('./handlers/voiceHandler');
const { setupTaskPromptHandler } = require('./handlers/taskPromptHandler');
const { setupInteractionHandler } = require('./handlers/interactionHandler');
const { setupRoleReactionDistributor, trackReactionRoleMessage } = require('./handlers/roleReactionDistributor');
const { reactionRoleChannelId, reactionRoleMessageId } = require('./config/bot-config.json');
const registerCommands = require('./utils/registerCommands');

const app = express();
const PORT = 5050;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildPresences,
        GatewayIntentBits.GuildMessages
    ],
    partials: [
        Partials.Message,
        Partials.Channel,
        Partials.Reaction,
        Partials.User,
        Partials.GuildMember
    ]
});

// Setup all handlers
setupVoiceHandler(client);
setupTaskPromptHandler(client);
setupInteractionHandler(client);
setupRoleReactionDistributor(client);

// Express route for external bot queries
app.get('/is-in-voice/:discordId', (req, res) => {
    const discordId = req.params.discordId;
    if (!discordId) return res.status(400).json({ error: "Missing Discord ID" });

    const channelId = getActiveVC(discordId);
    res.json({ inVoice: !!channelId, channelId: channelId || null });
});

// Start express server
app.listen(PORT, () => {
    console.log(`Bot API listening on port ${PORT}`);
});

client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    console.log(`Bot is in ${client.guilds.cache.size} guilds`);
    
    // Log the first guild's ID for debugging
    const firstGuild = client.guilds.cache.first();
    if (firstGuild) {
        console.log(`First guild ID: ${firstGuild.id}`);
    }

    // Register slash commands
    await registerCommands();

    // Optional: Track a message for reaction role assignment
    if (reactionRoleChannelId && reactionRoleMessageId) {
        trackReactionRoleMessage(reactionRoleChannelId, reactionRoleMessageId, client);
    } else {
        console.log('Reaction role tracking is disabled — no channel or message ID configured.');
    }
});

client.login(process.env.DISCORD_BOT_TOKEN);
