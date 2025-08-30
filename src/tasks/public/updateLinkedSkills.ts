import { User } from "../../db/dbTypes";
import { TaskData } from "../../utils/taskLoader";
import { updateGsheetsSkills, updateSkills } from "../../utils/discordUtils";
import { setTimeout } from "timers/promises";
import { Config } from "../../utils/configLoader";

async function updateLinkedSkills(_data: TaskData, _config: Config) {
    // FIXME: update ORM to allow for IS NOT NULL check
    const users = (await User.fetchArray()).filter((u) => u.player_id);
    const len = users.length;
    let c = 0,
        vc = 0;

    // update skills by batch of 50 per 5 seconds
    const interval = 5_000; // 5s

    while (c < len) {
        // Get next slice (max 10 / 5s = 100 / min = 6000 / hour)
        const slclen = Math.min(10, len - c);
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
        interval: 60,
        time: null,
        autoStart: true,
        runOnStart: true,
        repeat: 0,
        notResetOnReload: true,
    },
    run: updateLinkedSkills,
};
