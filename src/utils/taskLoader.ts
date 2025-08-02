type Task = {
    data: {
        [key: string]: any;
        name: string;
        interval?: null | number; // interval in minutes
        time?: null | string | string[]; // tod to activate it, format "HH:MM" (can be an array)
        // if neither interval nor time is provided, task can only be run if runOnStart is set to true
        autoStart?: null | boolean; // task will auto activate on every bot startup if true
        runOnStart?: null | boolean; // run once on bot startup (counts for repeats)
        repeat?: null | number; // 0 means infinite, once all repetitions are done, will need to be manually reactivated

        // Added by the loader
        activated?: boolean;
        nextTimestamp?: number;
        repeats?: number;
    };

    run: () => Promise<void>;
};

/*
Overall the same as commandLoader.js, with a few tweaks
*/

// Imports
import fs from "fs";
import path from "path";
import { computeNextTimestamp } from "./taskUtils";

// Dynamically loaded tasks
const tasks = {
    public: new Map<string, Task>(),
    dev: new Map<string, Task>(),
};
const publicDir = "./tasks/public/";
const devDir = "./tasks/dev/";

const getTargetMap = (guildId: string): Map<string, any> | undefined =>
    guildId == process.env.GUILD_ID
        ? tasks.public
        : guildId == process.env.DEV_GUILD_ID
          ? tasks.dev
          : undefined;

export function deactivateTask(task: Task) {
    task.data.activated = false;
    task.data.nextTimestamp = undefined;
    return true;
}

export function deactivateTaskByName(taskName: string, guildId: string) {
    // Get correct map
    const targetMap = getTargetMap(guildId);
    if (!targetMap) {
        console.log(`[WARN] Deactivate: unknown guild ${guildId} origin.`);
        return false;
    }

    const task = targetMap.get(taskName);
    if (!task) {
        console.log(`[WARN] Activate task ${taskName}: task doesn't exist.`);
        return;
    }

    return deactivateTask(task);
}

// Also resets repeats
export function activateTask(task: Task) {
    task.data.activated = true;
    if (task.data.repeat && task.data.repeat > 0)
        task.data.repeats = task.data.repeat;
    try {
        task.data.nextTimestamp = task.data.runOnStart
            ? 0
            : computeNextTimestamp(task.data);
    } catch (e) {
        console.error(`[ERROR] Task Activate:`, e);
        return false;
    }
    return true;
}

export function activateTaskByName(taskName: string, guildId: string) {
    // Get correct map
    const targetMap = getTargetMap(guildId);
    if (!targetMap) {
        console.log(`[WARN] Activate: unknown guild ${guildId} origin.`);
        return false;
    }

    const task = targetMap.get(taskName);
    if (!task) {
        console.log(`[WARN] Activate task ${taskName}: task doesn't exist.`);
        return;
    }

    return activateTask(task);
}

export function unloadTask(
    file: string,
    filePath: string,
    targetMap: Map<string, any>,
) {
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

export function loadTask(file: string, dir: string) {
    const targetMap =
        dir === devDir
            ? tasks.dev
            : dir === publicDir
              ? tasks.public
              : undefined;
    const guildId =
        dir === devDir
            ? process.env.DEV_GUILD_ID
            : dir === publicDir
              ? process.env.GUILD_ID
              : undefined;
    const name = file.replace(".js", ""); // task name instead of plain filename

    if (!targetMap || !guildId) {
        console.warn(
            `[WARN] HOT-RELOAD: Failed to load task ${name}, dir ${dir} unknown.`,
        );
        return;
    }

    const filePath = path.resolve(path.join(dir, file));
    console.log(filePath, file, dir);

    unloadTask(file, filePath, targetMap);

    try {
        // Load task to require memory
        const task: Task = require(filePath);

        if ("data" in task && "run" in task) {
            // Load task to map
            task.data.guildId = guildId; // Used later in taskRunner and available in task.run()
            targetMap.set(task.data.name, task);
            if (task.data.autostart || task.data.runOnStart)
                activateTaskByName(task.data.name, guildId);
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

export function initTaskLoad() {
    // Load public tasks
    fs.readdirSync(publicDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadTask(file, publicDir));

    // Load dev tasks
    fs.readdirSync(devDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadTask(file, devDir));
}

export const getGuildTasks = (guildId: string): Map<string, Task> => {
    switch (guildId) {
        case process.env.DEV_GUILD_ID:
            return tasks.dev;
        case process.env.GUILD_ID:
            return tasks.public;
        default:
            console.warn(
                `[WARN] | Unauthorized server tried to execute... a task ?. Guild ID: ${guildId}`,
            );
            return new Map<string, any>();
    }
};

export const getTasks = () => tasks;
// Useless rn
/*
const getTasksArray = (tasks) =>
    [...tasks.values()].map((task) => task.data);
*/
