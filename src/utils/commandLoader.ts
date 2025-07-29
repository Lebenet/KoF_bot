// Imports
import fs from "fs";
import path from "path";
import { REST, Routes } from "discord.js";

// Dynamically loaded commands
const commands = {
    public: new Map<string, any>(),
    dev: new Map<string, any>(),
};
const publicDir = "./commands/public/";
const devDir = "./commands/dev/";

export function unloadCommand(
    file: string,
    filePath: string,
    targetMap: Map<string, any>,
) {
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

export function loadCommand(file: string, dir: string) {
    const targetMap: Map<string, any> | undefined =
        dir === devDir
            ? commands.dev
            : dir === publicDir
              ? commands.public
              : undefined;
    const name = file.replace(".js", ""); // Command name instead of plain filename

    if (!targetMap) {
        console.warn(
            `[WARNING] | HOT-RELOAD: Failed to load command ${name}, dir ${dir} unknown.`,
        );
        return;
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
    } catch (err: any) {
        console.error(
            `[HOT-RELOAD] | [ERROR] Failed to load command ${name}:\n`,
            err,
        );
        // TODO: implement reloading old behaviour
    }
}
export function initCmdLoad() {
    // Load public commands
    fs.readdirSync(publicDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadCommand(file, publicDir));

    // Load dev commands
    fs.readdirSync(devDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadCommand(file, devDir));

    // Force reload helper after every command is loaded
    loadCommand("help.js", devDir);
    loadCommand("help.js", publicDir);
}

export const getGuildCommands = (guildId: string) => {
    switch (guildId) {
        case process.env.DEV_GUILD_ID:
            return commands.dev;
        case process.env.GUILD_ID:
            return commands.public;
        default:
            console.warn(
                `[WARN] | Member of an unauthorized server tried to execute a command. Guild ID: ${guildId}`,
            );
            return new Map<string, any>();
    }
};

export const getCommands = () => commands;
export const getSlashCommands = (cmds: Map<string, any>) =>
    new Map([...cmds].filter(([_k, c]) => typeof c.execute === "function"));
export const getCommandsArray = (cmds: Map<string, any>) => [
    ...cmds.values().map((cmd) => cmd.data.toJSON()),
];

// Set REST API
const rest = new REST().setToken(process.env.BOT_TOKEN ?? "");

// Sends slash commands to discord
export async function sendCommands(guildId: string) {
    try {
        console.log("Started refreshing application (/) commands.");

        await rest.put(
            Routes.applicationGuildCommands(
                process.env.CLIENT_ID ?? "",
                guildId,
            ),
            {
                body: getCommandsArray(
                    getSlashCommands(getGuildCommands(guildId)),
                ),
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
