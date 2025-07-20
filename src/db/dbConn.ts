import Database from "better-sqlite3";

// Temporary disabled saving database (for dev testing) "../db/database.db"
export const db = new Database(":memory:", {
    nativeBinding:
        "../node_modules/better-sqlite3/build/Release/better_sqlite3.node",
});
db.pragma("journal_mode = WAL");

process.on("exit", () => {
    db.close();
});
process.on("SIGINT", () => {
    db.close();
    process.exit();
});

// export const ready = () => db.open;

const tables = [
    `CREATE TABLE IF NOT EXISTS Users(
		id INTEGER PRIMARY KEY NOT NULL,
		username VARCHAR(255) NOT NULL DEFAULT "empty_username",
		bot_perm INTEGER NOT NULL DEFAULT 0
	);`,
    `CREATE TABLE IF NOT EXISTS ChannelParams(
		chan_id INTEGER NOT NULL,
		guild_id INTEGER NOT NULL,
		command_name VARCHAR(255) NOT NULL,
		command_param VARCHAR(255) NOT NULL,
		PRIMARY KEY(chan_id, guild_id, command_name, command_param)
	);`,
];

let _init: boolean = false;
function init() {
    if (_init) return;
    // Make sure every table exists correctly
    for (const table of tables) {
        db.exec(table);
    }
    _init = true;
}

init();
