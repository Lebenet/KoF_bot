import { User } from "../../db/dbTypes";
import { TaskData } from "../../utils/taskLoader";
import { updateGsheetsSkills, updateSkills } from "../../utils/discordUtils";
import { setTimeout } from "timers/promises";
import { Config } from "../../utils/configLoader";

async function updateLinkedSkills(data: TaskData, _config: Config) {
    // FIXME: update ORM to allow for IS NOT NULL check
    const users = User.fetchArray().filter((u) => u.player_id);
    const len = users.length;
    let c = 0,
        vc = 0;

    // update skills by batch of 50 per 5 seconds
    const interval = 5_000; // 5s

    while (c < len) {
        // Get next slice (max 50)
        const slclen = Math.min(50, len - c);
        const uslice = users.slice(c, c + slclen);
        c += slclen;

        // Try update for each user in the slice
        uslice.forEach((u: User) =>
            updateSkills(u)
                .then((res) => (vc += res.success ? 1 : 0))
                .catch(console.error),
        );

        await setTimeout(interval);
    }

    console.log(`Updated skills for ${vc}/${len} linked users.`);
    console.log("updating gsheets...");
    await updateGsheetsSkills();
}

module.exports = {
    data: {
        name: "Update Skills for Linked Users",
        interval: 60, // interval in minutes
        time: null, // tod to activate it, format "HH:MM" (can be an array)
        // if neither interval nor time is provided, task can only be run once if runOnStart is set to true
        autoStart: true, // task will auto activate on every bot startup if true
        runOnStart: true, // run once on bot startup (counts for repeats, also counts as autoStart)
        repeat: 0, // 0 means infinite, once all repetitions are done, will need to be manually reactivated
        notResetOnReload: true, // Not reset timestamp when the task is reloaded

        /* Added fields by loader and runner (useless/wrong unless mentionned otherwise):
			// Usable
			guildId?: string; // id of the guild this task is executed for
			repeats?: number; // How many times the task will be executed (0 | undefined = infinite, can be used here)

			// Useless
			activated: boolean; // Whether or not the task is currently activated
			nextTimestamp: number; // When the task will be next executed
			running?: boolean; // To ensure long-lasting tasks don't get activated twice
		*/
    },
    run: updateLinkedSkills,
};
