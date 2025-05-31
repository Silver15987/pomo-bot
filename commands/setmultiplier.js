const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setmultiplier')
        .setDescription('Set the points multiplier for VC time (admin only)')
        .addNumberOption(option =>
            option.setName('multiplier')
                .setDescription('Points multiplier per hour (e.g., 2 means 2 points per hour)')
                .setRequired(true)
                .setMinValue(0.1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        try {
            // Check if user has admin permissions
            const member = await interaction.guild.members.fetch(interaction.user.id);
            if (!member.permissions.has('Administrator')) {
                return interaction.deferReply({ ephemeral: true })
                    .then(() => interaction.editReply({
                        content: 'You need administrator permissions to use this command.',
                        ephemeral: true
                    }))
                    .catch(error => {
                        if (error.code === 10062) {
                            console.log(`[DEBUG] Interaction expired for ${interaction.user.id} during permission check`);
                        } else {
                            console.error(`[DEBUG] Error handling permission check for ${interaction.user.id}:`, error);
                        }
                    });
            }

            const multiplier = interaction.options.getNumber('multiplier');
            const configPath = path.join(__dirname, '..', 'config', 'bot-config.json');

            // Acknowledge the interaction immediately
            await interaction.deferReply({ ephemeral: true }).catch(error => {
                if (error.code === 10062) {
                    console.log(`[DEBUG] Interaction expired for ${interaction.user.id} during multiplier update`);
                    return null;
                }
                throw error;
            });

            if (!interaction.deferred) {
                console.log(`[DEBUG] Could not defer reply for ${interaction.user.id}, interaction may have expired`);
                return;
            }

            // Read current config
            const configData = await fs.readFile(configPath, 'utf8');
            const config = JSON.parse(configData);

            // Update multiplier
            config.pointsMultiplier = multiplier;

            // Write back to file
            await fs.writeFile(configPath, JSON.stringify(config, null, 2));

            // Edit the deferred reply
            await interaction.editReply({
                content: `Points multiplier has been set to ${multiplier} points per hour.`,
                ephemeral: true
            });
        } catch (error) {
            console.error('Error in setmultiplier command:', error);
            
            // Check if we can still respond to the interaction
            if (interaction.deferred) {
                await interaction.editReply({
                    content: 'Failed to update the points multiplier. Please try again later.',
                    ephemeral: true
                }).catch(error => {
                    if (error.code === 10062) {
                        console.log(`[DEBUG] Interaction expired for ${interaction.user.id} during error handling`);
                    } else {
                        console.error(`[DEBUG] Error editing reply for ${interaction.user.id}:`, error);
                    }
                });
            } else if (!interaction.replied) {
                await interaction.deferReply({ ephemeral: true })
                    .then(() => interaction.editReply({
                        content: 'Failed to update the points multiplier. Please try again later.',
                        ephemeral: true
                    }))
                    .catch(error => {
                        if (error.code === 10062) {
                            console.log(`[DEBUG] Interaction expired for ${interaction.user.id} during error handling`);
                        } else {
                            console.error(`[DEBUG] Error handling error response for ${interaction.user.id}:`, error);
                        }
                    });
            }
        }
    }
}; 