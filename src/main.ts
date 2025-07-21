// Imports
import fs from "fs";
import path from "path";

// CWD safeguard
const cwd = process.cwd();
const cwdShort = cwd.replace(path.dirname(cwd), "").replace(/[/\\]?/g, "");
if (cwdShort === "KoF_bot") process.chdir("./dist");
else if (!["KoF_bot", "dist"].includes(cwdShort))
    throw new Error(
        `[ERROR] Current working directory: ${cwdShort}. Please run this inside either project root or dist.`,
    );

import {
    ButtonInteraction,
    ChatInputCommandInteraction,
    Client,
    Events,
    GatewayIntentBits,
    Interaction,
    MessageFlags,
    ModalSubmitInteraction,
} from "discord.js";

import { start } from "./utils/watcher";

import { getSlashCommands, getGuildCommands } from "./utils/commandLoader";

import { getConfig, setDb, setBot } from "./utils/configLoader";

import { saveModalData, waitForUnlock, resendModal } from "./utils/modalSaver";

import { setClient, startTaskRunner } from "./utils/taskRunner";

import { db } from "./db/dbConn";
setDb(db);

// Load discord bot token from .env
require("dotenv").config();
const token = process.env.BOT_TOKEN;

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
});
client.once(Events.ClientReady, (readyClient) => {
    console.log(`Bot ready. Currently logged in as ${readyClient.user.tag}`);
});

// Log in to bot client
client.login(token);
setClient(client); // Tasks
setBot(client); // Commands

// Ensure temp dir exists
if (!fs.existsSync(path.resolve("temp/"))) fs.mkdirSync("temp/");

// Start watcher
console.log(`[STARTUP] Starting watcher...`);
start();

// Start task runner
console.log(`[STARTUP] Starting task runner...`);
startTaskRunner();

async function handleDeferredReply(
    interaction:
        | ChatInputCommandInteraction
        | ButtonInteraction
        | ModalSubmitInteraction,
    content: string,
    flags: any,
) {
    if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content, flags });
    } else {
        await interaction.reply({ content, flags });
    }
}

// Handle commands
client.on(Events.InteractionCreate, async (interaction: Interaction) => {
    const config: any = getConfig();

    // Slash command
    if (interaction.isChatInputCommand()) {
        // typeguard (not necessary but typescript annoying otherwise)
        if (!interaction.guildId) return;

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
        const commands = getSlashCommands(
            getGuildCommands(interaction.guildId),
        );
        if (commands.size === 0) {
            console.warn(
                `[WARN] | Execute: Unauthorized guild command execution from user ${interaction.user.username}(${interaction.user.id}).`,
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
        const [guildId, commandName, handlerName]: string[] =
            interaction.customId.split("|");
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
        const [guildId, commandName, handlerName]: string[] =
            interaction.customId.split("|");
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
