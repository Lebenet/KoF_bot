// Imports
import fs from "fs";
import path from "path";
import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    Interaction,
    REST,
    Routes,
    SlashCommandBuilder,
} from "discord.js";
import { Config } from "../db/dbTypes";

export type SubInteractionHandler = (...args: [Interaction, Config]) => void;

export type Command = {
    execute: (...args: [ChatInputCommandInteraction, Config]) => void;
    data: SlashCommandBuilder;
    help?: () => EmbedBuilder;
} & {
    [key: string]: SubInteractionHandler | any;
};

export type Commands = {
    public: Map<string, Command>;
    dev: Map<string, Command>;
    toString: () => string;
};

// Dynamically loaded commands
const commands: Commands = {
    public: new Map<string, Command>(),
    dev: new Map<string, Command>(),
    toString: () => {
        let res = "Dev: {\n";
        res += [...commands.dev.keys()].map((k) => "- " + k).join("\n");
        res += "\n}\n";
        res += "Public: {\n";
        res += [...commands.public.keys()].map((k) => "- " + k).join("\n");
        res += "\n}\n";
        return res;
    },
};
const publicDir = "./commands/public/";
const devDir = "./commands/dev/";

export function unloadCommand(
    file: string,
    filePath: string,
    targetMap: Map<string, Command>,
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
    const targetMap: Map<string, Command> | undefined =
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
    // console.log(filePath, file, dir);

    unloadCommand(file, filePath, targetMap);

    try {
        // Load command to require memory
        const command: Command = require(filePath);

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
            return new Map<string, Command>();
    }
};

export const getCommands = () => commands;
export const getSlashCommands = (cmds: Map<string, Command>) =>
    new Map([...cmds].filter(([_k, c]) => typeof c.execute === "function"));
export const getCommandsArray = (cmds: Map<string, Command>) => [
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
