export function fakeParisTimeToUTC() {
    const now = new Date();

    // Get current paris offset (1 or 2 hours)
    const match = now
        .toLocaleString("en-US", {
            timeZone: "Europe/Paris",
            timeZoneName: "short",
        })
        .match(/GMT([+-]\d+)/);

    let parisOffset = 0;
    if (match && match[1]) parisOffset = Number(match[1]) * 60;

    return new Date(now.getTime() + parisOffset * 60 * 1000);
}

export function getParisDatetimeSQLiteSafe(date?: Date | null): string {
    const now = date ? date : new Date();

    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Paris",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    }).formatToParts(now);

    const map: Record<string, string> = {};
    parts.forEach(({ type, value }) => {
        if (type !== "literal") map[type] = value;
    });

    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

export function computeNextTimestamp(data: any) {
    // Task deactivated or no repeats left
    if (!data.activated || data.repeats === 0) return undefined;

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
