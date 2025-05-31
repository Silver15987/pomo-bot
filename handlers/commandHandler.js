const fs = require('fs');
const path = require('path');

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

        try {
            // Defer reply immediately for all commands to prevent timeout
            await interaction.deferReply().catch(error => {
                if (error.code === 10062) {
                    console.log(`[CommandHandler] Interaction expired for command ${interaction.commandName}`);
                    return;
                }
                throw error;
            });

            // Execute the command
            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);
            
            // Handle different interaction states
            try {
                if (error.code === 10062) {
                    console.log(`[CommandHandler] Interaction expired for command ${interaction.commandName}`);
                    return;
                }

                if (interaction.deferred) {
                    await interaction.editReply({ 
                        content: 'There was an error executing this command!', 
                        ephemeral: true 
                    }).catch(console.error);
                } else if (!interaction.replied) {
                    await interaction.reply({ 
                        content: 'There was an error executing this command!', 
                        ephemeral: true 
                    }).catch(console.error);
                }
            } catch (replyError) {
                console.error('Error sending error message:', replyError);
            }
        }
    });
}

module.exports = { setupCommandHandler };
