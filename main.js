// Imports
const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const { start } = require('./utils/watcher.js');
const { getCommands, getGuildCommands } = require('./utils/commandLoader.js');
const { getConfig } = require('./utils/configLoader.js');

// Load discord bot token from .env
require('dotenv').config();
const token = process.env.BOT_TOKEN;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, readyClient => {
    console.log(`Bot ready. Currently logged in as ${readyClient.user.tag}`);
});

// Log in to bot client
client.login(token);

// Start watcher
start();

// Handle commands
client.on(Events.InteractionCreate, async interaction => {
    const config = getConfig();
    if (!interaction.isChatInputCommand())
        return;
    if (config.locked){
        await interaction.reply('Bot is reloading this command.');
        return;
    }
    
    const command = getGuildCommands(interaction.guildId).get(interaction.commandName);

    if (!command) {
        console.error(`No ${interaction.commandName} command found.`);
        return;
    }

    try {
        await command.execute(interaction, config);
    } catch (error) {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'An error occured while executing this command.', flags: MessageFlags.Ephemeral });
        } else {
            await interaction.reply({ content: 'An error occured while executing this command.', flags: MessageFlags.Ephemeral });
        }
    }
});