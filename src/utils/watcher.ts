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

let { startTaskRunner, stopTaskRunner } = require("./taskRunner");

import {
    loadConfig,
    addSingleConfig,
    getConfig,
    lockBot,
    unlockBot,
    deleteSingleConfig,
} from "./configLoader";

let {
    initTaskLoad,
    unloadTask,
    loadTask,
    getTasks,
    getGuildTasks,
} = require("./taskLoader");

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
            unloadTask(
                file,
                path.resolve(path.join(dir, file)),
                getGuildTasks(guildId),
            );
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

async function commandWatcherHandler(filePath: string, event: string) {
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
            await loadCommand(file, folders.commands[dir]);
            break;
        case "unlink":
            await unloadCommand(file, filePath, getGuildCommands(guildId));
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
                loadCommand("help.js", folders.commands[dir]).catch((err) => {
                    throw err;
                });
                sendCommands(guildId).catch((err) => {
                    throw err;
                });
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

/*
function reloadUtil(filePath: string) {
    const { file, dir } = getFileDir(filePath);
    const fullPath = require.resolve(path.resolve(path.join(dir, file)));
    delete require.cache[fullPath];
    return require(fullPath);
}
*/

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
    initCmdLoad().then(() => {
        const commands = getCommands();
        console.log("commands:\n", commands.toString());

        // Register slash commands to discord
        sendCommands(process.env.DEV_GUILD_ID ?? "").catch((err) => {
            throw err;
        });
        sendCommands(process.env.GUILD_ID ?? "").catch((err) => {
            throw err;
        });
    });

    // Load tasks
    initTaskLoad();
    const tasks = getTasks();
    console.log("Tasks:\n", tasks.toString());

    // Start task runner
    console.log(`[STARTUP] Starting task runner...`);
    startTaskRunner();

    /*
    const coreWatcher = chokidar.watch(["./utils/", "./db/"], {
        persistent: true, // runs as long as the bot is up
        ignoreInitial: true, // only notify on new file change
        ignored: (filePath, stats) =>
            (stats?.isFile() ?? false) && !filePath.endsWith(".js"), // only watch .js files
        usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
        interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
    });
    */

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

    // Bad, doesn't work for so many reasons, literally pulling my hair out because JAVASCRIPT IS FUCKING SHIT OMG PLEASE SOMEONE KILL ME
    /*
    coreWatcher
        .on("change", (filePath) => {
            lockBot();
            stopTaskRunner();

            if (filePath.endsWith("watcher.js")) return;

            try {
                console.log(`[WATCHER] util ${filePath} changed, attempting reloading...`);
                // Reload changed util
                let n: any = reloadUtil(filePath);

                // Reload all other necessary utils
                /*
                    If any of the following is changed, must restart process:
                    - start from watcher
                    - getSlashCommands, getGuildCommands from commandLoader
                    - getConfig, setDb, setBot from configLoader
                    - saveModalData, waitForUnlock, resendModal from modalSaver
                    - db from dbConn
                    - .env variables
                */ /*

                // not perfect, please shush
                ;
                switch (path.basename(filePath).replace(/(.m?c?[jt]s|[\s\\\/])/g, "")) {
                    case "states":
                        n = reloadUtil(`utils/commandLoader.js`);
                        unloadCommand = n.unloadCommand;
                        loadCommand = n.loadCommand;
                        sendCommands = n.sendCommands;
                        getCommands = n.getCommands;
                        n = reloadUtil(`utils/taskLoader.js`);
                        unloadTask = n.unloadTask;
                        loadTask = n.loadTask;
                        getTasks = n.getTasks;
                        reloadUtil(`utils/configLoader.js`);
                        break;
                    case "taskUtils":
                        n = reloadUtil(`utils/taskLoader.js`);
                        unloadTask = n.unloadTask;
                        loadTask = n.loadTask;
                        getTasks = n.getTasks;
                        n = reloadUtil(`utils/taskRunner.js`);
                        stopTaskRunner = n.stopTaskRunner;
                        startTaskRunner = n.startTaskRunner;
                        reloadUtil(`utils/discordUtils.js`);
                        reloadUtil(`db/dbTypes.js`);
                        break;
                    case "taskLoader":
                        unloadTask = n.unloadTask;
                        loadTask = n.loadTask;
                        getTasks = n.getTasks;
                        n = reloadUtil(`utils/taskRunner.js`);
                        stopTaskRunner = n.stopTaskRunner;
                        startTaskRunner = n.startTaskRunner;
                        break;
                    case "commandLoader":
                        reloadUtil(`db/dbTypes.js`);
                        unloadCommand = n.unloadCommand;
                        loadCommand = n.loadCommand;
                        sendCommands = n.sendCommands;
                        getCommands = n.getCommands;
                        break;
                    case "taskRunner":
                        stopTaskRunner = n.stopTaskRunner;
                        startTaskRunner = n.startTaskRunner;
                        break;
                    case "discordUtils":
                        reloadUtil(`db/dbTypes.js`);
                        break;
                    case "dbTypes":
                        reloadUtil(`utils/discordUtils.js`);
                        break;
                    case "dbConn":
                        // special case
                        require("./db/dbConn.js").init();
                        break;
                    default:
                        // unhandled
                }

                // Not optimal, but easiest way i could find
                // Reload all commands
                fs.readdirSync("./commands/")
                    .forEach((category) => fs.readdirSync(`./commands/${category}/`)
                        .forEach((f) => {
                            if (!f.endsWith(".js")) return;
                            loadCommand(f, `./commands/${category}/`)
                        }
                    ));

                // Reload all tasks 
                fs.readdirSync("./tasks/")
                    .forEach((category) => fs.readdirSync(`./tasks/${category}/`)
                        .forEach((f) => {
                            if (!f.endsWith(".js")) return;
                            console.log("reloading task", f);
                            loadTask(f, `./tasks/${category}/`)
                        }
                    ));

            } catch (err) {
                console.error(`[ERROR] Error reloading util ${filePath}.`, err);
            }

            startTaskRunner();
            unlockBot();
        });
    */

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
        .on("add", (filePath) =>
            commandWatcherHandler(filePath, "add").catch((err) => {
                throw err;
            }),
        )
        .on("change", (filePath) =>
            commandWatcherHandler(filePath, "change").catch((err) => {
                throw err;
            }),
        )
        .on("unlink", (filePath) =>
            commandWatcherHandler(filePath, "unlink").catch((err) => {
                throw err;
            }),
        );

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
