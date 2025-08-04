import { computeNextTimestamp, getParisDatetimeSQLiteSafe } from "./taskUtils";
import { getTasks, deactivateTask } from "./taskLoader";
import { getConfig } from "./configLoader";

// "Global" Variables
let intervalId: NodeJS.Timeout | null = null;

export function startTaskRunner() {
    if (intervalId) return;
    // run once to validate all "RunOnStart" tasks
    setTimeout(checker, 1_000); // initial run (because just calling the function doesn't work for some reason ???)
    intervalId = setInterval(checker, 60_000); // check every minute
}

export function stopTaskRunner() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
}

async function runTask(task: any) {
    try {
        const config = getConfig();

        await task.run(task.data, config);

        // Handle repeated tasks
        if (task.data.repeats > 1) {
            task.data.repeats--;
        } else if (task.data.repeats === 1) {
            deactivateTask(task);
        }
    } catch (err) {
        console.log(
            `[ERROR] Task ${task.data.name} run: an error occured:\n`,
            err,
        );
    }

    try {
        if (task.data.activated)
            task.data.nextTimestamp = computeNextTimestamp(task.data);
        else task.data.nextTimestamp = undefined;
    } catch (err) {
        console.log(
            `[WARN] Task ${task.data.name} computeNextTimestamp failed:`,
            err,
            "\n deactivating task.",
        );
        task.data.activated = false;
    }

    console.log(
        `[TASK] Task ${task.data.name} ran succesfully, and next timestamp has been set. (${new Date(task.data.nextTimestamp).toString()})`,
    );
}

async function checker() {
    if (!intervalId) return;
    const allTasks = getTasks();

    for (const [, tasks] of Object.entries(allTasks)) {
        if (typeof tasks === "function") continue;
        for (const [, task] of tasks) {
            const now = new Date(getParisDatetimeSQLiteSafe());
            // Safeguard (even though checked in taskLoader)
            if (typeof task.run !== "function") {
                console.warn(
                    `[WARN] Task ${task.data.name} has no valid run function.`,
                );
            } else if (
                task.data.activated &&
                typeof task.data.nextTimestamp === "number" &&
                task.data.nextTimestamp <= now.getTime()
            ) {
                // console.log(now.getHours() + ":" + now.getMinutes());
                console.log(`[INFO] Running task: ${task.data.name}`);
                runTask(task);
            }
        }
    }
}
