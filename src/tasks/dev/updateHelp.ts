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
        runOnStart: true, // run once on bot startup
    },
    run: updateHelp,
};
