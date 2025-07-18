const chokidar = require("chokidar");
const fs = require("node:fs");
const path = require("node:path");

const {
    initCmdLoad,
    unloadCommand,
    loadCommand,
    sendCommands,
    getCommands,
    getGuildCommands,
} = require("./commandLoader.js");

const {
    loadConfig,
    addSingleConfig,
    /* updateSingleConfig, deleteSingleConfig, */ getConfig,
    lockBot,
    unlockBot,
    deleteSingleConfig,
} = require("./configLoader.js");

const {
    initTaskLoad,
    unloadTask,
    loadTask,
    getTasks,
    getGuildTasks,
} = require("./taskLoader.js");

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

function taskWatcherHandler(filePath, event) {
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
            const guild_id = getGuildId(dir);
            unloadTask(file, filePath, getGuildTasks(guild_id));
            break;
        default:
            console.log(`[WARN] Task Watcher: Unhandled event ${event}.`);
    }

    console.log(getTasks());

    console.log(`[WATCHER](Task) ${event}${event === "change" ? "" : "e"}d: ${filePath}`);
}

function getFileDir(filePath) {
    const file = path.basename(filePath);
    const dir = path.dirname(filePath);
    console.log(file, dir); // FIXME: TO TEST
    return { file, dir };
}

const getGuildId = (dir) =>
    dir.endsWith(path.join("commands", "public"))
        ? process.env.GUILD_ID
        : process.env.DEV_GUILD_ID;

function start() {
    // Ensure that config folder exists
    if (!fs.existsSync("./data/")) {
        fs.mkdirSync("./data");
    }

    // Load config
    loadConfig(fs.readdirSync("./data/"));
    const config = getConfig();
    console.log("config:\n", config);

    // Load commands
    initCmdLoad();
    const commands = getCommands();
    console.log("commands:\n", commands);

    // Register slash commands to discord
    sendCommands(process.env.DEV_GUILD_ID);
    sendCommands(process.env.GUILD_ID);

    // Load tasks
    initTaskLoad()
    const tasks = getTasks();
    console.log("Tasks:\n", tasks);

    const watcherTask = chokidar.watch(
        ["./tasks/public/", "./tasks/dev/"],
        {
            persistent: true, // runs as long as the bot is up
            ignoreInitial: true, // ignore initial files
            ignored: (filePath, stats) =>
                stats?.isFile() && !filePath.endsWith(".js"), // only watch .js files
            usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
            interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
        },
    );

    const watcherCmd = chokidar.watch(
        ["./commands/public/", "./commands/dev/"],
        {
            persistent: true, // runs as long as the bot is up
            ignoreInitial: true, // ignore initial files
            ignored: (filePath, stats) =>
                stats?.isFile() && !filePath.endsWith(".js"), // only watch .js files
            usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
            interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
        },
    );

    const watcherCfg = chokidar.watch("./data/", {
        persistent: true,
        ignoreInitial: true,
        ignored: (filePath, stats) =>
            stats?.isFile() && !filePath.endsWith(".json"),
        usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
        interval: Number(process.env.CHOKIDAR_POLL_INTERVAL) || 1000, // ms
    });

    watcherTask
        .on("add", (filePath) => { taskWatcherHandler(filePath, "add") })
        .on("change", (filePath) => { taskWatcherHandler(filePath, "change") })
        .on("unlink", (filePath) => { taskWatcherHandler(filePath, "unlink") });


    watcherCmd
        .on("add", (filePath) => {
            // Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
            lockBot();

            const { file, dir } = getFileDir(filePath);
            if (!file || !dir) {
                console.error(
                    `[ERROR] | WatcherCmd add: failed to extract filename and dir from filePath: ${filePath}`,
                );
                return;
            }

            const guild_id = getGuildId(dir);
            loadCommand(file, folders.commands[dir]);
            sendCommands(guild_id);
            console.log(getCommands());

            console.log(`[WATCHER] | Added: ${filePath}`);

            // Unlock bot once hot-reload is complete
            unlockBot();
        })
        .on("change", (filePath) => {
            // Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
            lockBot();

            const { file, dir } = getFileDir(filePath);
            if (!file || !dir) {
                console.error(
                    `[ERROR] | WatcherCmd change: failed to extract filename and dir from filePath: ${filePath}`,
                );
                return;
            }

            const guild_id = getGuildId(dir);
            loadCommand(file, folders.commands[dir]);
            sendCommands(guild_id);
            console.log(getCommands());

            console.log(`[WATCHER] | Changed: ${filePath}`);

            // Unlock bot once hot-reload is complete
            unlockBot();
        })
        .on("unlink", (filePath) => {
            // Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
            lockBot();

            const { file, dir } = getFileDir(filePath);
            if (!file || !dir) {
                console.error(
                    `[ERROR] | WatcherCmd unlink: failed to extract filename and dir from filePath: ${filePath}`,
                );
                return;
            }

            const guild_id = getGuildId(dir);
            unloadCommand(file, filePath, getGuildCommands(guild_id));
            sendCommands(guild_id);
            console.log(getCommands());

            console.log(`[WATCHER] | Unlinked: ${filePath}`);

            // Unlock bot once hot-reload is complete
            unlockBot();
        });

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

module.exports = {
    start,
};
