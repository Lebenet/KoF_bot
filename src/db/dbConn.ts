import Database from "better-sqlite3";

// Temporary disable saving database (for dev testing): ":memory:"
export const db = new Database("../db/database.db", {
    nativeBinding:
        "../node_modules/better-sqlite3/build/Release/better_sqlite3.node",
});
db.pragma("journal_mode = WAL");

process.on("exit", () => {
    try {
        db.pragma("wal_checkpoint(TRUNCATE)"); // Force flush + truncate WAL
    } catch (err) {
        console.error("Checkpoint failed on exit:", err);
    }
    db.close();
});
process.on("SIGINT", () => {
    try {
        db.pragma("wal_checkpoint(TRUNCATE)"); // Force flush + truncate WAL
    } catch (err) {
        console.error("Checkpoint failed on exit:", err);
    }
    db.close();
    process.exit();
});

// export const ready = () => db.open;

const tables = [
    // Temporary

    // `DROP TABLE Skills`,
    // `DROP TABLE Users`,
    // `DROP TABLE IF EXISTS Professions`,

    // End temporary

    `CREATE TABLE IF NOT EXISTS ChannelParams(
		channel_id TEXT NOT NULL,
		guild_id TEXT NOT NULL,
		command_name VARCHAR(255) NOT NULL,
		command_param VARCHAR(255) NOT NULL,
		PRIMARY KEY(guild_id, command_name, command_param)
	);`,
    `CREATE TABLE IF NOT EXISTS Users(
		id TEXT PRIMARY KEY NOT NULL,
		player_id TEXT,
		username VARCHAR(255) NOT NULL DEFAULT "empty_username",
		player_username VARCHAR(255) NOT NULL DEFAULT "empty_game_username",
		bot_perm INTEGER NOT NULL DEFAULT 0,
		last_updated_skills DATETIME
	);`,

    // DO NOT DELETE, ONLY ALTER
    `CREATE TABLE IF NOT EXISTS Professions(
		p_name VARCHAR(255) NOT NULL PRIMARY KEY,
		description TEXT NOT NULL,
		emoji TEXT NOT NULL DEFAULT "⁉️"
	);`,
    `CREATE TABLE IF NOT EXISTS Fournisseurs(
		user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
		guild_id TEXT NOT NULL,
		coordinator BOOLEAN NOT NULL DEFAULT FALSE CHECK (coordinator IN (0, 1)),
		profession_name VARCHAR(255) NOT NULL REFERENCES Professions(p_name) ON DELETE CASCADE,
		PRIMARY KEY (user_id, guild_id, profession_name)
	);`,
    `CREATE TABLE IF NOT EXISTS Skills(
		user_id TEXT REFERENCES Users(id) ON DELETE CASCADE,
		xp INTEGER NOT NULL DEFAULT 0,
		level INTEGER NOT NULL DEFAULT 0,
		profession_name VARCHAR(255) REFERENCES Professions(p_name) ON DELETE CASCADE,
		PRIMARY KEY (user_id, profession_name)
	);`,

    `CREATE TABLE IF NOT EXISTS Commands(
		id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
		guild_id TEXT NOT NULL,
		thread_id TEXT NOT NULL,
		message_id TEXT,
		panel_message_id TEXT,
		c_name VARCHAR(255) NOT NULL,
		chest VARCHAR(255) NOT NULL DEFAULT "Pas de lieu de depot specifié.",
		description TEXT NOT NULL DEFAULT "Une commande de matériaux.",
		self_supplied BOOLEAN NOT NULL DEFAULT FALSE CHECK (self_supplied IN (0, 1)),
		last_edited DATETIME NOT NULL DEFAULT (datetime('now', 'localtime')),
		author_id TEXT NOT NULL REFERENCES Users(id),
		status VARCHAR(255) NOT NULL DEFAULT "Building"
	);`,
    `CREATE TABLE IF NOT EXISTS CommandAssignees(
		command_id INTEGER NOT NULL REFERENCES Commands(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
		PRIMARY KEY(command_id, user_id)
	);`,
    `CREATE TABLE IF NOT EXISTS CommandProfessions(
		command_id INTEGER NOT NULL REFERENCES Commands(id) ON DELETE CASCADE,
		profession_name VARCHAR(255) NOT NULL REFERENCES Professions(p_name) ON DELETE CASCADE,
		filled BOOLEAN NOT NULL DEFAULT FALSE CHECK (filled IN (0, 1)),
		PRIMARY KEY (command_id, profession_name)
	);`,
    `CREATE TABLE IF NOT EXISTS CommandItems (
		command_id INTEGER NOT NULL REFERENCES Commands(id) ON DELETE CASCADE,
		item_name TEXT NOT NULL,
		quantity INTEGER NOT NULL DEFAULT 1,
		message_id TEXT NOT NULL,
		PRIMARY KEY (command_id, item_name)
	);`,
];

let _init: boolean = false;
function init() {
    if (_init) return;
    // Make sure every table exists correctly
    for (const table of tables) {
        try {
            db.exec(table);
        } catch (err) {
            console.log(table);
            throw err;
        }
    }
    _init = true;
}

init();
