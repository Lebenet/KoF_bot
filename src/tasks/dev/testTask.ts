async function testTask(data: any, ctx: any) {
    console.log(`Test task from ${ctx.bot.guilds.cache.get(data.guildId)}`);
}

module.exports = {
    data: {
        name: "Test Task",
        interval: 1, // interval in minutes
        time: null, // tod to activate it, format "HH:MM" (can be an array)
        autostart: false, // task will auto activate on every bot startup if true
        repeat: 5, // 0 means infinite, once all repetitions are done, will need to be manually reactivated
    },
    run: testTask,
};
