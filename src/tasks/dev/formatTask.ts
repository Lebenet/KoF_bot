import { Config } from "../../utils/configLoader";
import { TaskData } from "../../utils/taskLoader";

async function formatTask(_data: TaskData, _config: Config) {
    // do stuff
}

module.exports = {
    data: {
        name: "Task Format (template)", // Cannot be null or undefined
        interval: null, // number: interval in minutes
        time: null, // str | str[]: tod to activate it, format "HH:MM" (can be an array)
        // if neither interval nor time is provided, task can only be run once if runOnStart is set to true
        autoStart: true, // boolean: task will auto activate on every bot startup if true
        // autoStart CANNOT be "true" if neither interval nor time is set, UNLESS runOnStart is set to "true" and repeat to "1".
        // If you want to just run it once on startup, then set runOnStart to true.
        // TL;DR:
        // - startup only: runOnStart -> true
        // - on task re/load: autoStart -> true, either set a time/interval (offset) (normal task) or set repeat to 1
        runOnStart: false, // boolean: run once on bot startup (counts for repeats)
        repeat: 1, // number: 0 means infinite, once all repetitions are done, will need to be manually reactivated
        notResetOnReload: null, // boolean: Not reset nextTimestamp when the task is reloaded
        // If runOnStart is set to true, and notResetOnReload to false/null,
        // Then the task will be executed everytime the task is reloaded (file change or dependency change)

        /* Added fields by loader and runner (useless/wrong unless mentionned otherwise):
			// Usable
			guildId?: string; // id of the guild this task is executed for
			repeats?: number; // How many times the task will be executed (0 | undefined = infinite, can be used here)

			// Useless
			activated: boolean; // Whether or not the task is currently activated
			nextTimestamp: number; // When the task will be next executed
			running?: boolean; // To ensure long-lasting tasks don't get activated twices
		*/
    },
    run: formatTask,
};
