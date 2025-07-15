/*
Overall the same as commandLoader.js, with a few tweaks
*/

// Imports
const fs = require("node:fs");
const path = require("node:path");

// Dynamically loaded tasks
const tasks = {
    public: new Map(),
    dev: new Map(),
};
const activeTasks = {
    timed: new Map(),
    repeat: new Map(),
}
const publicDir = "./tasks/public/";
const devDir = "./tasks/dev/";

function deactivate(task) {

}

function activate(task) {
    
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
        dir == devDir
            ? tasks.dev
            : dir == publicDir
              ? tasks.public
              : undefined;
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

        if ("data" in task && "execute" in task) {
            // Load task to map
            targetMap.set(task.data.name, task);
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
const getActive = () => activeTasks;

module.exports = {
    initLoad,
    unloadTask,
    loadTask,
    deactivate,
    activate,
    gettasks,
    getActive,
    gettasksArray,
    getGuildtasks,
};
