// Loaded from the file
export type TaskDataLoad = {
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
export type TaskData = {
    [key: string]: any;
    guildId?: string; // Guild id the task is executed for
    activated?: boolean; // Whether or not it is activated
    nextTimestamp?: number; // Next time it will be ran
    repeats?: number; // How many repeats are left
    running?: boolean; // To ensure long-lasting tasks don't get activated twice
} & TaskDataLoad;

export type Task = {
    data: TaskData;
    run: (...args: [TaskData, Config]) => Promise<void>;
};

export type Tasks = {
    public: Map<string, Task>;
    dev: Map<string, Task>;
    toString: (guildId?: string) => string;
};

/*
Overall the same as commandLoader.js, with a few tweaks
*/

// Imports
import fs from "fs";
import path from "path";
import { computeNextTimestamp } from "./taskUtils";
import { Config } from "./configLoader";
import { __get_tasks } from "./states";

export const reloadDummyTaskLoader = "...";

// Dynamically loaded tasks
let __init = true;
const tasks = __get_tasks();

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
        task.data.nextTimestamp =
            task.data.runOnStart && __init
                ? Date.now() - 500 // ms (acceptable offset)
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
    try {
        // Get task from require memory
        const modPath = require.resolve(filePath);
        const oldMod = require.cache[modPath];

        // console.log("require cache:\n", require.cache);
        // console.log("require keys:", Object.keys(require.cache).filter((k) => k.includes("usr/bot/dist")));
        // console.log("resolved mod:\n", oldMod);
        // console.log("filePath:", filePath);
        // console.log("resolved modPath:", modPath);
        // console.log("has modpath:", Object.keys(require.cache).includes(modPath));
        // console.log("file:", file);
        // console.log("mod children:", oldMod?.children.map((m) => "- " + m.id ).join(",\n"));

        // Deep cleaning
        // TODO: better deep clean that will only clean the changed dependencies (dunno how)
        //oldMod?.children.forEach((dep) => {
        //    if (!dep.path.toLowerCase().match(/(?:watcher|main).js$/))
        //        delete require.cache[dep.id];
        //});

        // Delete task from require memory
        delete require.cache[modPath];

        // Delete task from map
        //console.log(targetMap.keys());
        //console.log(oldMod?.exports.data.name);
        targetMap.delete(oldMod?.exports.data.name);
    } catch (err) {
        console.error(
            `[ERROR] Hot-reload: error while unloading task ${file}:\n`,
            err,
        );
        // just means didn't need reloading
    }
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

    try {
        // Get current loaded task (if it exists)
        const currTask = require.cache[require.resolve(filePath)];
        const nreset: boolean =
            currTask?.exports?.data?.notResetOnReload ?? false;
        if (currTask) unloadTask(file, filePath, targetMap);

        // Load task to require memory
        const task: Task = require(filePath);

        if ("data" in task && "run" in task) {
            // Load task to map
            task.data.guildId = guildId; // Used later in taskRunner and available in task.run()
            targetMap.set(task.data.name, task);
            if (task.data.autoStart || (task.data.runOnStart && __init))
                activateTaskByName(task.data.name, guildId);

            // if notResetOnReload has been set (override runner data for the task)
            if (nreset) {
                // Meaning it will only get reset with a manual reset or after all iterations have been done
                // New data will not be applied until manual reset/repeats completing, but behaviour does change
                task.data.nextTimestamp = currTask?.exports.data.nextTimestamp;
                task.data.repeats = currTask?.exports.data.repeats;
                task.data.activated = currTask?.exports.data.activated;
            }
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
    __init = true;

    // Load public tasks
    fs.readdirSync(publicDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadTask(file, publicDir));

    // Load dev tasks
    fs.readdirSync(devDir)
        .filter((file) => file.endsWith(".js"))
        .forEach((file) => loadTask(file, devDir));

    __init = false;
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
