async function testTask(_data, _config, _client) {
    console.log("Test task");
}

module.exports = {
    data: {
        name: "Test Task",
        interval: 5, // interval in minutes
        time: null, // tod to activate it, format "HH:MM" (can be an array)
        autoStart: true, // task will auto activate on every bot startup if true
        repeat: 5 // 0 means infinite, once all repetitions are done, will need to be manually reactivated
    },
    run: testTask
};