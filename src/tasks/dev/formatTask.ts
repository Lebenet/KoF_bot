import { Config } from "../../db/dbTypes";
import { TaskData } from "../../utils/taskLoader";

async function formatTask(_data: TaskData, _config: Config) {
    // do stuff
}

module.exports = {
    data: {
        name: "Test Task",
        interval: null, // interval in minutes
        time: null, // tod to activate it, format "HH:MM" (can be an array)
        // if neither interval nor time is provided, task can only be run once if runOnStart is set to true
        autostart: false, // task will auto activate on every bot startup if true
        runOnStart: false, // run once on bot startup (counts for repeats)
        repeat: 0, // 0 means infinite, once all repetitions are done, will need to be manually reactivated

        /* Added fields available in runner:
            activated: boolean; // Whether or not the task is currently activated (useless in here)
            nextTimestamp: number; // When the task will be next executed
            repeats?: number; // How many times the task will be executed (0 | undefined = infinite)
        */
    },
    run: formatTask,
};
