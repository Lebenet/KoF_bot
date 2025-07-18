// Imports
const fs = require("node:fs");
const path = require("node:path");

const {
    Client,
    Events,
    GatewayIntentBits,
    MessageFlags,
} = require("discord.js");

const { start } = require("./utils/watcher.js");

const {
    getSlashCommands,
    getGuildCommands,
} = require("./utils/commandLoader.js");

const { getConfig } = require("./utils/configLoader.js");

const {
    saveModalData,
    waitForUnlock,
    resendModal,
} = require("./utils/modalSaver.js");

const { setClient, startTaskRunner } = require("./utils/taskRunner.js");

// Load discord bot token from .env
require("dotenv").config();
const token = process.env.BOT_TOKEN;

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot ready. Currently logged in as ${readyClient.user.tag}`);
    setClient(client);
});

// Log in to bot client
client.login(token);

// Ensure temp dir exists
if (!fs.existsSync(path.resolve("temp/")))
    fs.mkdirSync("temp/");

// Start watcher
console.log(`[STARTUP] Starting watcher...`);
start();

// Start task runner
console.log(`[STARTUP] Starting task runner...`);
startTaskRunner();

async function handleDeferredReply(interaction, content, flags) {
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: content, flags: flags });
    } else {
        await interaction.reply({ content: content, flags: flags });
    }
}

// Handle commands
client.on(Events.InteractionCreate, async (interaction) => {
    const config = getConfig();

    // Slash command
    if (interaction.isChatInputCommand()) {
        // Make sure that nothing happens in the few milliseconds while reloading the command
        if (config.locked && interaction.commandName != "lockbot") {
            await handleDeferredReply(
                interaction,
                "Bot is reloading, please try again shortly.",
                MessageFlags.Ephemeral,
            );
            return;
        }

        // Get the correct command using guildId and the command name
        const commands = getSlashCommands(getGuildCommands(interaction.guildId));
        if (commands.size === 0) {
            console.warn(
                `[WARN] | Execute: Unauthorized guild command execution from user ${interaction.user.username(interaction.user.id)}.`,
            );
            await handleDeferredReply(
                interaction,
                "Warning: This guild is not authorized to operate this application. Please contact `lebenet` on Discord if you think this is a mistake.",
                MessageFlags.Ephemeral,
            );
            return;
        }

        const command = commands.get(interaction.commandName);

        if (!command) {
            console.error(`No ${interaction.commandName} command found.`);
            await handleDeferredReply(
                interaction,
                "This command doesn't exists.",
                MessageFlags.Ephemeral,
            );
            return;
        }

        try {
            await command.execute(interaction, config);
        } catch (err) {
            console.error(`[EXECUTE] An error occured:\n`, err);
            await handleDeferredReply(
                interaction,
                "An error occured while executing this bot command.",
                MessageFlags.Ephemeral,
            );
        }
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
        // Make sure that nothing happens in the few milliseconds while reloading, but also saves the user input
        if (config.locked) {
            saveModalData(interaction); // Maybe move WaitForUnlock call inside this function
            await handleDeferredReply(
                interaction,
                "Bot is reloading, your form data has been saved.\n Bot will DM you when it's finished.",
                MessageFlags.Ephemeral,
            );

            // call a watcher to resend forms after unlock
            await waitForUnlock(client.users);
            return;
        }

        // Handle modal submit
        const elms = interaction.customId.split("|");
        const [guildId, commandName, handlerName] = elms;
        const command = getGuildCommands(guildId).get(commandName);

        // If saved modal resent to the user
        if (!interaction.guildId)
            // Reset guildId in case the handler needs it
            interaction.guildId = guildId;

        try {
            await command[handlerName](interaction, config);
        } catch (err) {
            console.error(`[EXECUTE] An error occured:\n`, err);
            await handleDeferredReply(
                interaction,
                "An error occured while executing this command.",
                MessageFlags.Ephemeral,
            );
        }
        // console.log('received modal');
    }

    // Button click
    if (interaction.isButton()) {
        // Make sure that nothing happens in the few milliseconds while reloading, but also saves the user input
        if (config.locked) {
            await handleDeferredReply(
                interaction,
                "Bot is reloading. Please click again shortly.",
                MessageFlags.Ephemeral,
            );
            return;
        }

        if (interaction.customId.startsWith("resend_modal")) {
            // Resend modal button
            resendModal(interaction);
            return;
        }

        // Handle other buttons
        const elms = interaction.customId.split("|");
        const [guildId, commandName, handlerName] = elms;
        const command = getGuildCommands(guildId).get(commandName);

        try {
            command[handlerName](interaction, config);
        } catch (err) {
            console.error(`[EXECUTE] An error occured:\n`, err);
            await handleDeferredReply(
                interaction,
                "An error occured while executing this command.",
                MessageFlags.Ephemeral,
            );
        }
    }
});
