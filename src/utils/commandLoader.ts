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
import { Config } from "../utils/configLoader";
import * as states from "./states";

export const reloadDummyConmmandLoader = "..s.";

export type SubInteractionHandler = (
    ...args: [Interaction, Config]
) => Promise<void>;

export type Command = {
    execute: (...args: [ChatInputCommandInteraction, Config]) => Promise<void>;
    data: SlashCommandBuilder | (() => SlashCommandBuilder);
    help?: () => EmbedBuilder;
} & {
    [key: string]: SubInteractionHandler | any;
};

export type Commands = {
    public: Map<string, Command>;
    dev: Map<string, Command>;
    toString: (guildId?: string) => string;
};

// Dynamically loaded commands
const commands = states.__get_commands();

const publicDir = "./commands/public/";
const devDir = "./commands/dev/";

export function unloadCommand(
    file: string, // deprecated but can't be bothered
    filePath: string,
    targetMap: Map<string, Command>,
) {
    // Delete command from require memory
    try {
        const modPath = require.resolve(filePath);
        const oldMod = require.cache[modPath];

        // Deep cleaning
        // oldMod?.children.forEach((dep) => {
        //     if (!dep.path.toLowerCase().endsWith("watcher.js"))
        //         delete require.cache[dep.id];
        // });

        delete require.cache[modPath];

        // Delete command from map
        targetMap.delete(oldMod?.exports.data.name);
    } catch (err) {
        console.error("File did not need reloading", err);
        // just means didn't need reloading
    }
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
            const data =
                typeof command.data === "function"
                    ? command.data()
                    : command.data;
            targetMap.set(data.name, command);
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
        .filter((file) => file.endsWith(".js") && !file.includes("help"))
        .forEach((file) => loadCommand(file, publicDir));

    // Load dev commands
    fs.readdirSync(devDir)
        .filter((file) => file.endsWith(".js") && !file.includes("help"))
        .forEach((file) => loadCommand(file, devDir));

    // Load helpers once
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
            return new Map<string, Command>();
    }
};

export const getCommands = () => commands;
export const getSlashCommands = (cmds: Map<string, Command>) =>
    new Map([...cmds].filter(([_k, c]) => typeof c.execute === "function"));
export const getCommandsArray = (cmds: Map<string, Command>) => [
    ...cmds
        .values()
        .map((cmd) =>
            typeof cmd.data === "function"
                ? cmd.data().toJSON()
                : cmd.data.toJSON(),
        ),
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
