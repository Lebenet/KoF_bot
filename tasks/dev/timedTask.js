async function timedTask(_data, ctx) {
    console.log(`Hello i am a timed task from guild ${ctx.bot.guilds.cache.get(ctx.data.guildId)}`);
}

module.exports = {
    data: {
        name: "Timed Task",
        interval: null, // interval in minutes
        time: ["17:20", "17:21", "17:22", "17:23", "17:24", "17:25"], // tod to activate it, format "HH:MM" (can be an array)
        autoStart: true, // task will auto activate on every bot startup if true
        repeat: 5 // 0 means infinite, once all repetitions are done, will need to be manually reactivated
    },
    run: timedTask
};