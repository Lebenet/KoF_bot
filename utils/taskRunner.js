const { computeNextTimestamp, fakeParisTimeToUTC } = require("./taskUtils.js");
const { getTasks, deactivateTask } = require("./taskLoader.js");
const { getConfig } = require("./configLoader.js");
const { DateTime } = require("luxon");

// "Global" Variables
let refClient = null;
let intervalId = null;

// Setters
const setClient = (bot) => refClient = bot;

function startTaskRunner() {
    if (intervalId) return;
    intervalId = setInterval(checker, 60_000); // check every minute
}

function stopTaskRunner() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
}

async function runTask(task) {
    try {
        const config = getConfig();

        const ctx = {
            config: config,
            bot: refClient,
        };

        await task.run(task.data, ctx);

        // Handle repeated tasks
        if (task.data.repeats > 1) {
            task.data.repeats--;
        } else if (task.data.repeats === 1) {
            deactivateTask(task);
        }

    } catch (err) {
        console.log(`[ERROR] Task ${task.data.name} run: an error occured:\n`, err);
    }
    
    try {
        if (task.data.activated)
            task.data.nextTimestamp = computeNextTimestamp(task.data);
        else task.data.nextTimestamp = undefined;
    } catch (err) {
        console.log(`[WARN] Task ${task.data.name} computeNextTimestamp failed:`, err, "\n deactivating task.");
        task.data.activated = false;
    }

    console.log(`[TASK] Task ${task.data.name} ran succesfully, and next timestamp has been set. (${new Date(task.data.nextTimestamp)})`);
}

async function checker() {
    if (!refClient || !intervalId) return;
    const allTasks = getTasks();

    for (const [, tasks] of Object.entries(allTasks)) {
        for (const [, task] of tasks) {
            const now = fakeParisTimeToUTC();
            // Safeguard (even though checked in taskLoader)
            if (typeof task.run !== "function") {
                console.warn(`[WARN] Task ${task.data.name} has no valid run function.`);
            } else if (task.data.activated && task.data.nextTimestamp <= now.getTime()) {
                // console.log(now.getHours() + ":" + now.getMinutes());
                console.log(`[INFO] Running task: ${task.data.name}`);
                runTask(task);
            }
        }
    }
}

module.exports = {
    setClient,
    startTaskRunner,
    stopTaskRunner,
};