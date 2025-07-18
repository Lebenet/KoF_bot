async function timedTask(data, ctx) {
    console.log(`Hello i am a timed task from guild ${ctx.bot.guilds.cache.get(data.guildId)}`);
}

module.exports = {
    data: {
        name: "Timed Task",
        interval: null, // interval in minutes
        time: ["12:32", "12:33", "12:34", "12:35", "12:36", "12:37", "12:38", "12:39", "12:40", "12:41", "12:42"], // tod to activate it, format "HH:MM" (can be an array)
        autostart: true, // task will auto activate on every bot startup if true
        repeat: 5 // 0 means infinite, once all repetitions are done, will need to be manually reactivated
    },
    run: timedTask
};