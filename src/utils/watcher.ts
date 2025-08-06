import chokidar from "chokidar";
import fs from "fs";
import path from "path";

const timeoutsMap = new Map<string, NodeJS.Timeout>();

import {
    initCmdLoad,
    unloadCommand,
    loadCommand,
    sendCommands,
    getCommands,
    getGuildCommands,
} from "./commandLoader";

import {
    loadConfig,
    addSingleConfig,
    /* updateSingleConfig, deleteSingleConfig, */ getConfig,
    lockBot,
    unlockBot,
    deleteSingleConfig,
} from "./configLoader";

import {
    initTaskLoad,
    unloadTask,
    loadTask,
    getTasks,
    getGuildTasks,
} from "./taskLoader";

const folders = {
    commands: {
        [path.join("commands", "dev")]: "./commands/dev/",
        [path.join("commands", "public")]: "./commands/public/",
    },
    tasks: {
        [path.join("tasks", "dev")]: "./tasks/dev/",
        [path.join("tasks", "public")]: "./tasks/public/",
    },
};

function taskWatcherHandler(filePath: string, event: string) {
    const { file, dir } = getFileDir(filePath);
    if (!file || !dir) {
        console.error(
            `[ERROR] WatcherTask ${event}: failed to extract filename and dir from filePath: ${filePath}`,
        );
        return;
    }

    switch (event) {
        case "add":
        case "change":
            loadTask(file, folders.tasks[dir]);
            break;
        case "unlink":
            const guildId = getGuildId(dir);
            unloadTask(file, filePath, getGuildTasks(guildId));
            break;
        default:
            console.log(`[WARN] Task Watcher: Unhandled event ${event}.`);
    }

    console.log(
        `[WATCHER](Task) ${event}${event === "change" ? "" : "e"}d: ${filePath}`,
    );
    const tmt = timeoutsMap.get("tasks");
    if (tmt) tmt.refresh();
    else
        timeoutsMap.set(
            "tasks",
            setTimeout(() => {
                console.log(getTasks().toString());
                timeoutsMap.delete("tasks");
            }, 1_000),
        );
}

function commandWatcherHandler(filePath: string, event: string) {
    // Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
    lockBot();

    const { file, dir } = getFileDir(filePath);
    if (!file || !dir) {
        console.error(
            `[ERROR] | WatcherCmd ${event}: failed to extract filename and dir from filePath: ${filePath}`,
        );
        return;
    }

    const guildId = getGuildId(dir);

    switch (event) {
        case "add":
        case "change":
            loadCommand(file, folders.commands[dir]);
            break;
        case "unlink":
            unloadCommand(file, filePath, getGuildCommands(guildId));
            break;
        default:
            console.log(`[WARN] Command Watcher: Unhandled event ${event}.`);
    }

    const tmt = timeoutsMap.get(guildId);
    if (tmt) tmt.refresh();
    else
        timeoutsMap.set(
            guildId,
            setTimeout(() => {
                loadCommand("help.js", folders.commands[dir]);
                sendCommands(guildId);
                console.log(getCommands().toString(guildId));
                timeoutsMap.delete(guildId);
            }, 1_000),
        );

    console.log(
        `[WATCHER] ${event}${event === "change" ? "" : "e"}d: ${filePath}`,
    );

    // Unlock bot once hot-reload is complete
    unlockBot();
}

function getFileDir(filePath: string) {
    const file = path.basename(filePath);
    const dir = path.dirname(filePath);

    return { file, dir };
}

const getGuildId = (dir: string): string =>
    dir.endsWith(path.join("commands", "public"))
        ? (process.env.GUILD_ID ?? "")
        : (process.env.DEV_GUILD_ID ?? "");

export function start() {
    // Ensure that config folder exists
    if (!fs.existsSync("./data/")) {
        fs.mkdirSync("./data");
    }

    // Load config
    loadConfig(fs.readdirSync("./data/"));
    const config = getConfig();
    console.log("-=========-   CONFIG:");
    Object.entries(config).forEach(([k, v]) => {
        if (k !== "bot") console.log(`${k}:`, v);
    });
    console.log("-========-");

    // Load commands
    initCmdLoad();
    const commands = getCommands();
    console.log("commands:\n", commands.toString());

    // Register slash commands to discord
    sendCommands(process.env.DEV_GUILD_ID ?? "");
    sendCommands(process.env.GUILD_ID ?? "");

    // Load tasks
    initTaskLoad();
    const tasks = getTasks();
    console.log("Tasks:\n", tasks.toString());

    const watcherTask = chokidar.watch(["./tasks/public/", "./tasks/dev/"], {
        persistent: true, // runs as long as the bot is up
        ignoreInitial: true, // ignore initial files
        ignored: (filePath, stats) =>
            (stats?.isFile() ?? false) && !filePath.endsWith(".js"), // only watch .js files
        usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
        interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
    });

    const watcherCmd = chokidar.watch(
        ["./commands/public/", "./commands/dev/"],
        {
            persistent: true, // runs as long as the bot is up
            ignoreInitial: true, // ignore initial files
            ignored: (filePath, stats) =>
                (stats?.isFile() ?? false) && !filePath.endsWith(".js"), // only watch .js files
            usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
            interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
        },
    );

    const watcherCfg = chokidar.watch("./data/", {
        persistent: true,
        ignoreInitial: true,
        ignored: (filePath, stats) =>
            (stats?.isFile() ?? false) && !filePath.endsWith(".json"),
        usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
        interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
    });

    watcherTask
        .on("add", (filePath) => {
            taskWatcherHandler(filePath, "add");
        })
        .on("change", (filePath) => {
            taskWatcherHandler(filePath, "change");
        })
        .on("unlink", (filePath) => {
            taskWatcherHandler(filePath, "unlink");
        });

    watcherCmd
        .on("add", (filePath) => commandWatcherHandler(filePath, "add"))
        .on("change", (filePath) => commandWatcherHandler(filePath, "change"))
        .on("unlink", (filePath) => commandWatcherHandler(filePath, "unlink"));

    watcherCfg
        .on("add", (filePath) => {
            lockBot();

            const { file, dir } = getFileDir(filePath);
            if (!file || !dir) {
                console.error(
                    `[ERROR] | WatcherCfg add: failed to extract filename and dir from filePath: ${filePath}`,
                );
                return;
            }

            addSingleConfig(file);
            console.log(getConfig());

            unlockBot();
        })
        .on("change", (filePath) => {
            lockBot();

            const { file, dir } = getFileDir(filePath);
            if (!file || !dir) {
                console.error(
                    `[ERROR] | WatcherCfg change: failed to extract filename and dir from filePath: ${filePath}`,
                );
                return;
            }

            addSingleConfig(file);
            console.log(getConfig());

            unlockBot();
        })
        .on("unlink", (filePath) => {
            lockBot();

            const { file, dir } = getFileDir(filePath);
            if (!file || !dir) {
                console.error(
                    `[ERROR] | WatcherCfg unlink: failed to extract filename and dir from filePath: ${filePath}`,
                );
                return;
            }

            deleteSingleConfig(file);
            console.log(getConfig());

            unlockBot();
        });
}
