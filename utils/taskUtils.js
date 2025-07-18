function fakeParisTimeToUTC() {
    const now = new Date();

    // Get current paris offset (1 or 2 hours)
    const parisOffset = now.toLocaleString('en-US', {
        timeZone: "Europe/Paris",
        timeZoneName: "short",
    }).match(/GMT([+-]\d+)/)[1] * 60;

    return new Date(now.getTime() + (parisOffset * 60 * 1000));
}

function computeNextTimestamp(data) {
    // Task deactivated or no repeats left
    if (!data.activated || data.repeats === 0)
        return undefined;

    const now = fakeParisTimeToUTC();

    if (data.time) {
        // Handle both string and array of strings
        const times = Array.isArray(data.time) ? data.time : [data.time];

        for (const time of times) {
            const [hour, minute] = time.split(":").map(Number);
            const target = new Date(now);
            target.setHours(hour, minute, 0, 0);

            if (target >= now) {
                return target.getTime(); // closest future time today
            }
        }

        // If no valid time today, schedule for first one tomorrow
        const [hour, minute] = times[0].split(":").map(Number);
        const target = new Date(now);

        target.setDate(target.getDate() + 1);
        target.setHours(hour, minute, 0, 0);

        return target.getTime();
    } else if (data.interval) {
        // now + interval
        return now.getTime() + data.interval * 60 * 1000;
    }

    throw new Error("No valid time or interval set.");
}

module.exports = {
    fakeParisTimeToUTC,
    computeNextTimestamp,
};

