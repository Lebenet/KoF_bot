/*
Overall the same as commandLoader.js, with a few tweaks
*/

// Imports
const fs = require("node:fs");
const path = require("node:path");
const { computeNextTimestamp } = requite("./taskUtils.js");

// Dynamically loaded tasks
const tasks = {
    public: new Map(),
    dev: new Map(),
};
const publicDir = "./tasks/public/";
const devDir = "./tasks/dev/";

const getTargetMap = (guildId) => 
        guildId == process.env.GUILD_ID
            ? tasks.public 
            : guildId == process.env.DEV_GUILD_ID
                ? tasks.dev
                : undefined;

function deactivate(taskName, guildId) {
    // Get correct map
    const targetMap = getTargetMap(guildId);
    if (!targetMap) {
        console.log(`[WARN] Deactivate: unknown guild ${guildId} origin.`);
        return false;
    }

    const task = targetMap.get(taskName);
    task.activated = false;
    task.nextTimestamp = undefined;
    return true;
}

// Also resets repeats
function activate(taskName, guildId) {
    // Get correct map
    const targetMap = getTargetMap(guildId);
    if (!targetMap) {
        console.log(`[WARN] Activate: unknown guild ${guildId} origin.`);
        return false;
    }

    const task = targetMap.get(taskName);
    task.activated = true;
    if (task.repeat > 0)
        task.repeats = task.repeat;
    try {
        task.nextTimestamp = computeNextTimestamp(task.data);
    } catch (e) {
        console.error(`[ERROR] Task Activate:`, e);
        return false;
    }
    return true;
}

function unloadTask(file, filePath, targetMap) {
    // Delete task from require memory
    try {
        delete require.cache[require.resolve(filePath)];
    } catch (err) {
        console.log(err);
        // just means didn't need reloading
    }

    // Delete task from map
    targetMap.delete(file.replace(".js", ""));
}

function loadTask(file, dir) {
    const targetMap =
        dir === devDir
            ? tasks.dev
            : dir === publicDir
              ? tasks.public
              : undefined;
    const guildId = dir === devDir ? process.env.DEV_GUILD_ID : process.env.GUILD_ID;
    const name = file.replace(".js", ""); // task name instead of plain filename

    if (!targetMap) {
        console.warn(
            `[WARNING] | HOT-RELOAD: Failed to load task ${name}, dir ${dir} unknown.`,
        );
    }
    const filePath = path.resolve(path.join(dir, file));
    console.log(filePath, file, dir);

    unloadtask(file, filePath, targetMap);

    try {
        // Load task to require memory
        const task = require(filePath);

        if ("data" in task && "run" in task) {
            // Load task to map
            targetMap.set(task.data.name, task);
            if (task.data.autostart) activate(task, guildId);
        } else {
            console.warn(
                `[HOT-RELOAD] | [WARN] task ${name} missing "data" or "execute" fields.`,
            );
        }
    } catch (err) {
        console.error(
            `[HOT-RELOAD] | [ERROR] Failed to load task ${name}:\n`,
            err,
        );
        // TODO: implement reloading old behaviour
    }
}

function initLoad() {
    // Load public tasks
    fs.readdirSync(publicDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadTask(file, publicDir));

    // Load dev tasks
    fs.readdirSync(devDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadTask(file, devDir));
}

const getGuildtasks = (guildId) => {
    switch (guildId) {
        case process.env.DEV_GUILD_ID:
            return tasks.dev;
        case process.env.GUILD_ID:
            return tasks.public;
        default:
            console.warn(
                "[WARN] | Unauthorized server tried to execute... a task ?. Guild ID: ${guildId}",
            );
            return new Map();
    }
};

const gettasks = () => tasks;
const gettasksArray = (tasks) =>
    [...tasks.values()].map((task) => task.data.toJSON());

module.exports = {
    initLoad,
    unloadTask,
    deactivate,
    loadTask,
    activate,
    gettasks,
    gettasksArray,
    getGuildtasks,
};
