const fs = require('fs');
const path = require('path');
const { logger } = require('../utils/logger');

//--------------------------------bug fix -------------------------------------//
/* Bug: DiscordAPIError[40060]: Interaction has already been acknowledged
Discord interactions are only valid for 3 seconds. If we don't respond within that time, the interaction becomes "unknown". 
Commands like clearleaderboard need longer than 3 seconds to process so they try to respond again but the interaction is already acknowledged.
To fix this:
1. Always use deferReply() at the start of long-running commands
2. Use editReply() instead of reply() after deferReply()
3. Add proper error handling for expired interactions
4. Check interaction state before responding
*/

function setupCommandHandler(client) {
    const commands = new Map();
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            commands.set(command.data.name, command);
            console.log(`Loaded command: ${command.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }

    client.on('interactionCreate', async interaction => {
        if (!interaction.isChatInputCommand()) return;

        const command = commands.get(interaction.commandName);
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        // Wrap the entire command execution in a try-catch
        try {
            await handleCommand(interaction, command);
        } catch (error) {
            // This catch block should never be reached if handleCommand is working properly
            // But we keep it as a last resort safety net
            logger.logError(error, {
                type: 'command_handler_error',
                command: interaction.commandName,
                userId: interaction.user.id
            });
        }
    });
}

async function handleCommand(interaction, command) {
    // Step 1: Defer the reply
    try {
        await interaction.deferReply().catch(error => {
            if (error.code === 10062) {
                logger.logSystem('Interaction expired during defer', {
                    command: interaction.commandName,
                    userId: interaction.user.id
                });
                return;
            }
            throw error;
        });
    } catch (error) {
        logger.logError(error, {
            type: 'defer_reply_error',
            command: interaction.commandName,
            userId: interaction.user.id
        });
        return;
    }

    // Step 2: Execute the command
    try {
        await command.execute(interaction);
    } catch (error) {
        // Log the error with context
        logger.logError(error, {
            type: 'command_execution_error',
            command: interaction.commandName,
            userId: interaction.user.id,
            options: interaction.options.data
        });

        // Handle the error based on its type
        await handleCommandError(interaction, error);
    }
}

async function handleCommandError(interaction, error) {
    // Don't try to respond if the interaction is already handled
    if (interaction.replied || interaction.deferred) {
        try {
            // Check if the error is a known type
            if (error.code === 10062) {
                logger.logSystem('Interaction expired during command execution', {
                    command: interaction.commandName,
                    userId: interaction.user.id
                });
                return;
            }

            // Handle database errors
            if (error.name === 'MongoError' || error.name === 'MongoServerError') {
                await interaction.editReply({
                    content: 'There was an error accessing the database. Please try again later.',
                    ephemeral: true
                });
                return;
            }

            // Handle permission errors
            if (error.code === 50013) {
                await interaction.editReply({
                    content: 'I don\'t have the required permissions to perform this action.',
                    ephemeral: true
                });
                return;
            }

            // Handle validation errors
            if (error.name === 'ValidationError') {
                await interaction.editReply({
                    content: `Invalid input: ${error.message}`,
                    ephemeral: true
                });
                return;
            }

            // Handle any other errors
            await interaction.editReply({
                content: 'An error occurred while executing this command. Please try again later.',
                ephemeral: true
            });
        } catch (replyError) {
            logger.logError(replyError, {
                type: 'error_reply_failed',
                originalError: error.message,
                command: interaction.commandName,
                userId: interaction.user.id
            });
        }
    }
}

module.exports = { setupCommandHandler };
