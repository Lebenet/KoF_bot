import Database from "better-sqlite3";
import {
    Interaction,
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    EmbedBuilder,
    Client,
    AutocompleteInteraction,
} from "discord.js";

type SubInteractionHandler = (...args: [Interaction, Config]) => Promise<void>;

type Command = {
    execute: (...args: [ChatInputCommandInteraction, Config]) => Promise<void>;
    autocomplete?: (
        ...args: [AutocompleteInteraction, Config]
    ) => Promise<void>;
    data: SlashCommandBuilder | (() => SlashCommandBuilder);
    help?: () => EmbedBuilder;
} & {
    [key: string]: SubInteractionHandler | any;
};

type Commands = {
    public: Map<string, Command>;
    dev: Map<string, Command>;
    toString: (guildId?: string) => string;
};

// Loaded from the file
type TaskDataLoad = {
    name: string;
    interval?: null | number; // interval in minutes
    time?: null | string | string[]; // tod to activate it, format "HH:MM" (can be an array)
    // if neither interval nor time is provided, task can only be run if runOnStart is set to true
    autoStart?: null | boolean; // task will auto activate on every bot startup if true
    runOnStart?: null | boolean; // run once on bot startup (counts for repeats)
    repeat?: null | number; // 0 means infinite, once all repetitions are done, will need to be manually reactivated
    notResetOnReload?: null | boolean; // Not reset timestamp when the task is reloaded
};

// Additional fields for task data (mostly internal use)
type TaskData = {
    [key: string]: any;
    guildId?: string; // Guild id the task is executed for
    activated?: boolean; // Whether or not it is activated
    nextTimestamp?: number; // Next time it will be ran
    repeats?: number; // How many repeats are left
    running?: boolean; // To ensure long-lasting tasks don't get activated twice
} & TaskDataLoad;

type Task = {
    data: TaskData;
    run: (...args: [TaskData, Config]) => Promise<void>;
};

type Tasks = {
    public: Map<string, Task>;
    dev: Map<string, Task>;
    toString: (guildId?: string) => string;
};

type Config = {
    locked: boolean;
    bot: Client;
    db: Database.Database;
    admins: Array<string>;
    [key: string]: any;
};

declare global {
    var __commands: Commands | undefined;
    var __tasks: Tasks | undefined;
    var __config: Partial<Config> | undefined;
}

if (!globalThis.__commands)
    globalThis.__commands = {
        public: new Map<string, Command>(),
        dev: new Map<string, Command>(),
        toString: function (guildId?: string) {
            let res = "";
            if (!guildId || guildId === process.env.DEV_GUILD_ID) {
                res += "Dev: {\n";
                res += [...this.dev.keys()].map((k) => "- " + k).join("\n");
                res += "\n}\n";
            }
            if (!guildId || guildId === process.env.GUILD_ID) {
                res += "Public: {\n";
                res += [...this.public.keys()].map((k) => "- " + k).join("\n");
                res += "\n}\n";
            }
            return res;
        },
    };

export const __get_commands = () => globalThis.__commands as Commands;

if (!globalThis.__tasks)
    globalThis.__tasks = {
        public: new Map<string, Task>(),
        dev: new Map<string, Task>(),
        toString: function (guildId?: string) {
            let res = "";
            if (!guildId || guildId === process.env.DEV_GUILD_ID) {
                res += "Dev: {\n";
                res += [...this.dev.entries()]
                    .map(
                        ([k, t]) =>
                            "- " +
                            k +
                            (t.data.nextTimestamp
                                ? `(${new Date(t.data.nextTimestamp).toString()})`
                                : ""),
                    )
                    .join("\n");
                res += "\n}\n";
            }
            if (!guildId || guildId === process.env.GUILD_ID) {
                res += "Public: {\n";
                res += [...this.public.entries()]
                    .map(
                        ([k, t]) =>
                            "- " +
                            k +
                            (t.data.nextTimestamp
                                ? `(${new Date(t.data.nextTimestamp).toString()})`
                                : ""),
                    )
                    .join("\n");
                res += "\n}\n";
            }
            return res;
        },
    };

export const __get_tasks = () => globalThis.__tasks as Tasks;

if (!globalThis.__config)
    globalThis.__config = {
        locked: false, // Bot lock during hot-reload (or other)
    };

export const __get_config = () => globalThis.__config as Partial<Config>;
