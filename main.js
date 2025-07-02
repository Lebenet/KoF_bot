// Imports
const fs = require('node:fs');
const path = require('node:path');
const { Client, Events, GatewayIntentBits, MessageFlags, ModalBuilder, ButtonBuilder, ButtonStyle, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { start } = require('./utils/watcher.js');
const { getCommands, getGuildCommands } = require('./utils/commandLoader.js');
const { getConfig } = require('./utils/configLoader.js');
//const { getModals, saveModalData, rebuildModals, resendModal } = require('./utils/modalSaver.js');

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

const savedModalInteractions = new Map();
const savedModals = new Map();

function saveModalData(interaction) {
    savedModalInteractions.set(interaction.customId,  [interaction.user.id, interaction.fields]);
    console.log(`[HOT-RELOAD] | Bot is reloading. Saving following modal data: ${savedModalInteractions.get(interaction.customId)}`);
}

waitingForUnlock = false;

async function rebuildModals() {
    // Resend all stored modals to the clients
    console.log(`[HOT-RELOAD] | Bot has finished reloading. Sending back saved modals.`)
    for (const [modalId, [userId, fields]] of savedModalInteractions.entries()) {
        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`${modalId.split('|').at(-1)} (resent)`);

        // Add all the fields back to the modal
        for (const [key, value] of fields.fields.entries()) {
            modal.addComponents(
                new ActionRowBuilder()
                    .addComponents(
                        new TextInputBuilder()
                            .setCustomId(key)
                            .setLabel(key)
                            .setStyle(TextInputStyle.Short)
                            .setValue(value.value)
                    )
            );
        }

        savedModals.set(modalId, modal);

        // Get user that sent the modal
        const user = await client.users.fetch(userId);

        console.log(`Sending form recovery to ${user.tag}`);
        // DM him with a button to resend the modal
        await user.send({
            content: 'Hey, the bot has finished reloading. Click the button below to retrieve your filled form.',
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`resend_modal:${modalId}`)
                        .setLabel('Reopen Form')
                        .setStyle(ButtonStyle.Primary)
                )
            ]
        });
    }

    savedModalInteractions.clear();
}

async function resendModal(interaction) {
    try {
        const modal = savedModals.get(interaction.customId.replace('resend_modal:', ''));

        // Resend modal to the user and delete recovery button
        await interaction.message.delete();
        await interaction.showModal(modal);
    } catch {
        console.error(`[ERROR] | [HOT-RELOAD] Saver has failed to send form back to user ${interaction.user.username}`);
    }
}

async function waitForUnlock(interval = 500) {
    while (true) {
        const config = getConfig();
        if (!config.locked) {
            await rebuildModals();
            waitingForUnlock = false;
            return;
        }

        await new Promise(resolve => setTimeout(resolve, interval));
    }
}

async function handleDeferredReply(interaction, content, flags) {
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: content, flags: flags });
    } else {
        await interaction.reply({ content: content, flags: flags });
    }
}

// Handle commands
client.on(Events.InteractionCreate, async interaction => {
    const config = getConfig();

    // Slash command
    if (interaction.isChatInputCommand()) {
        // Make sure that nothing happens in the few milliseconds while reloading the command
        if (config.locked && interaction.commandName != 'lockbot'){
            await handleDeferredReply(interaction, 'Bot is reloading, please try again shortly.', MessageFlags.Ephemeral);
            return;
        }

        // Get the correct command using guildId and the command name
        const command = getGuildCommands(interaction.guildId).get(interaction.commandName);

        if (!command) {
            console.error(`No ${interaction.commandName} command found.`);
            await handleDeferredReply(interaction, 'This command doesn\'t exists.', MessageFlags.Ephemeral);
            return;
        }

        try {
            await command.execute(interaction, config);
        } catch (err) {
            console.error(`[EXECUTE] An error occured:\n`, err);
            await handleDeferredReply(interaction, 'An error occured while executing this bot command.', MessageFlags.Ephemeral);
        }
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
        // Make sure that nothing happens in the few milliseconds while reloading, but also saves the user input
        if (config.locked) {
            saveModalData(interaction);
            await handleDeferredReply(interaction, 'Bot is reloading, your form data has been saved.\n Bot will DM you when it\'s finished.', MessageFlags.Ephemeral);

            // call a watcher to resend forms after unlock
            if (!waitingForUnlock){
                waitingForUnlock = true;
                await waitForUnlock();
            }
            return;
        }

        // Handle modal submit
        console.log('received modal');
    }

    // Button click
    if (interaction.isButton()) {
        // Make sure that nothing happens in the few milliseconds while reloading, but also saves the user input
        if (config.locked) {
            await handleDeferredReply(interaction, 'Bot is reloading. Please click again shortly.', MessageFlags.Ephemeral);
            return;
        }

        if (interaction.customId.startsWith('resend_modal')) {
            // Resend modal button
            resendModal(interaction);
            return;
        }

        // Handle other buttons
    }
});