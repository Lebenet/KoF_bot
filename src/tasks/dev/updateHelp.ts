import { Config } from "../../db/dbTypes";
import { loadCommand, sendCommands } from "../../utils/commandLoader";

const dir = (guildId: string) =>
    guildId === process.env.GUILD_ID ? "./commands/public/" : "./commands/dev/";

async function updateHelp(data: any, config: Config) {
    console.log(
        "Updating help command for guild",
        config.bot.guilds.cache.get(data.guildId)?.name + "...",
    );
    loadCommand("help.js", dir(data.guildId));
    sendCommands(data.guildId);
}

module.exports = {
    data: {
        name: "Update Help Command",
        interval: 5, // interval in minutes
        time: null, // tod to activate it, format "HH:MM" (can be an array)
        autostart: true, // task will auto activate on every bot startup if true
        runOnStart: true, // run once on bot startup
        repeat: 0, // 0 means infinite, once all repetitions are done, will need to be manually reactivated
    },
    run: updateHelp,
};
