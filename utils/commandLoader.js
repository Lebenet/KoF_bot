// Imports
const fs = require("node:fs");
const path = require("node:path");
const { REST, Routes } = require("discord.js");

// Dynamically loaded commands
const commands = {
    public: new Map(),
    dev: new Map(),
};
const publicDir = "./commands/public/";
const devDir = "./commands/dev/";

function unloadCommand(file, filePath, targetMap) {
    // Delete command from require memory
    try {
        delete require.cache[require.resolve(filePath)];
    } catch (err) {
        console.log(err);
        // just means didn't need reloading
    }

    // Delete command from map
    targetMap.delete(file.replace(".js", ""));
}

function loadCommand(file, dir) {
    const targetMap =
        dir == devDir
            ? commands.dev
            : dir == publicDir
              ? commands.public
              : undefined;
    const name = file.replace(".js", ""); // Command name instead of plain filename

    if (!targetMap) {
        console.warn(
            `[WARNING] | HOT-RELOAD: Failed to load command ${name}, dir ${dir} unknown.`,
        );
    }
    const filePath = path.resolve(path.join(dir, file));
    console.log(filePath, file, dir);

    unloadCommand(file, filePath, targetMap);

    try {
        // Load command to require memory
        const command = require(filePath);

        if ("data" in command && "execute" in command) {
            // Load command to map
            targetMap.set(command.data.name, command);
        } else {
            console.warn(
                `[HOT-RELOAD] | [WARN] Command ${name} missing "data" or "execute" fields.`,
            );
        }
    } catch (err) {
        console.error(
            `[HOT-RELOAD] | [ERROR] Failed to load command ${name}:\n`,
            err,
        );
        // TODO: implement reloading old behaviour
    }
}
function initCmdLoad() {
    // Load public commands
    fs.readdirSync(publicDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadCommand(file, publicDir));

    // Load dev commands
    fs.readdirSync(devDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadCommand(file, devDir));
}

const getGuildCommands = (guildId) => {
    switch (guildId) {
        case process.env.DEV_GUILD_ID:
            return commands.dev;
        case process.env.GUILD_ID:
            return commands.public;
        default:
            console.warn(
                `[WARN] | Member of an unauthorized server tried to execute a command. Guild ID: ${guildId}`,
            );
            return new Map();
    }
};

const getCommands = () => commands;
const getSlashCommands = (cmds) => new Map(
    [...cmds].filter(([_k, c]) => typeof c.execute === "function"));
const getCommandsArray = (cmds) =>
    [...cmds.values().map((cmd) => cmd.data.toJSON())];

// Set REST API
const rest = new REST().setToken(process.env.BOT_TOKEN);

// Sends slash commands to discord
async function sendCommands(guildId) {
    try {
        console.log("Started refreshing application (/) commands.");

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            {
                body: getCommandsArray(getSlashCommands(getGuildCommands(guildId))),
            },
        );

        console.log("Successfully reloaded application (/) commands.");
    } catch (err) {
        console.error(
            `[ERROR] | [HOT-RELOAD]: Failed to update guild commands for Guild ID ${guildId}: \n`,
            err,
        );
    }
}

module.exports = {
    initCmdLoad,
    unloadCommand,
    loadCommand,
    getCommands,
    getSlashCommands,
    getCommandsArray,
    getGuildCommands,
    sendCommands,
};
