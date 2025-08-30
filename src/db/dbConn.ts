// import Database from 'better-sqlite3';
import { connect, Client as Database, SSLMode } from "ts-postgres";

export const reloadDummyDbTables = ".s..";

declare global {
    var __db: Database | undefined;
}

// Temporary disable saving database (for dev testing): ':memory:'
export const db = (): Database => globalThis.__db as Database;
// export const ready = () => db.open;

const tables = [
    // Temporary

    // `DROP TABLE ChannelParams;`,
    // `DROP TABLE Skills`,
    // `DROP TABLE Users`,
    // `DROP TABLE IF EXISTS Professions`,

    // End temporary
    `CREATE TABLE IF NOT EXISTS Users(
		id TEXT PRIMARY KEY NOT NULL,
		player_id TEXT,
		username VARCHAR(255) NOT NULL DEFAULT 'empty_username',
		player_username VARCHAR(255) NOT NULL DEFAULT 'empty_game_username',
		bot_perm INTEGER NOT NULL DEFAULT 0,
		last_updated_skills TIMESTAMPTZ
	);`,

    `CREATE TABLE IF NOT EXISTS Settlements (
		id SERIAL NOT NULL PRIMARY KEY,
		guild_id TEXT NOT NULL,
		s_name TEXT NOT NULL,
		owner_id TEXT REFERENCES Users(id) ON DELETE SET NULL,
		member_count INTEGER NOT NULL DEFAULT 1,
		UNIQUE (guild_id, s_name)
	);`,
    `CREATE TABLE IF NOT EXISTS SettlementMembers (
		settlement_id INTEGER NOT NULL REFERENCES Settlements(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
		perm_level INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (settlement_id, user_id)
	);`,

    `CREATE TABLE IF NOT EXISTS ChannelParams(
		id SERIAL NOT NULL PRIMARY KEY,
		channel_id TEXT NOT NULL,
		guild_id TEXT NOT NULL,
		settlement_id INTEGER REFERENCES Settlements(id) ON DELETE CASCADE, 
		command_name VARCHAR(255) NOT NULL,
		command_param VARCHAR(255) NOT NULL,
		UNIQUE(guild_id, settlement_id, command_name, command_param)
	);`,

    `CREATE TABLE IF NOT EXISTS LastUpdateds(
		table_name TEXT NOT NULL PRIMARY KEY,
		last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
	);`,

    `CREATE TABLE IF NOT EXISTS Empires(
		entityId TEXT NOT NULL PRIMARY KEY,
		e_name TEXT NOT NULL,
		memberCount TEXT NOT NULL,
		leader TEXT NOT NULL
	);`,

    `CREATE TABLE IF NOT EXISTS SharedCraftsStatuss(
		id SERIAL NOT NULL PRIMARY KEY,
		guild_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		claim_id TEXT NOT NULL,
		UNIQUE (guild_id, channel_id, claim_id)
	);`,

    `CREATE TABLE IF NOT EXISTS SharedCrafts(
		id SERIAL NOT NULL PRIMARY KEY,
		message_id TEXT NOT NULL,
		entityId TEXT NOT NULL,
		status_id INTEGER NOT NULL REFERENCES SharedCraftsStatuss(id),
		item_name TEXT NOT NULL,
		crafting_station TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'In Progress',
		claim_name TEXT NOT NULL,
		progress INTEGER NOT NULL,
		total INTEGER NOT NULL,
		owner_name TEXT NOT NULL
	);`,

    `CREATE TABLE IF NOT EXISTS WatchtowerStatuss(
		guild_id TEXT NOT NULL,
		channel_id TEXT NOT NULL,
		message_id TEXT NOT NULL,
		empire_id TEXT NOT NULL REFERENCES Empires(entityId) ON DELETE CASCADE,
		PRIMARY KEY (guild_id, channel_id, empire_id)
	);`,

    // DO NOT DELETE, ONLY ALTER
    `CREATE TABLE IF NOT EXISTS Professions(
		p_name VARCHAR(255) NOT NULL PRIMARY KEY,
		kind TEXT NOT NULL DEFAULT 'unknown',
		description TEXT NOT NULL,
		emoji TEXT NOT NULL DEFAULT '⁉️',
		skill_id INTEGER NOT NULL DEFAULT 0
	);`,
    `CREATE TABLE IF NOT EXISTS Fournisseurs (
		id SERIAL PRIMARY KEY,
		user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
		guild_id TEXT NOT NULL,
		settlement_id INTEGER REFERENCES Settlements(id) ON DELETE CASCADE,
		coordinator BOOLEAN NOT NULL DEFAULT FALSE,
		profession_name VARCHAR(255) NOT NULL REFERENCES Professions(p_name) ON DELETE CASCADE,
		UNIQUE(user_id, guild_id, settlement_id, profession_name)
	);`,
    `CREATE TABLE IF NOT EXISTS Skills(
		user_id TEXT REFERENCES Users(id) ON DELETE CASCADE,
		xp INTEGER NOT NULL DEFAULT 0,
		level INTEGER NOT NULL DEFAULT 0,
		profession_name VARCHAR(255) REFERENCES Professions(p_name) ON DELETE CASCADE,
		PRIMARY KEY (user_id, profession_name)
	);`,

    `CREATE TABLE IF NOT EXISTS Commands(
		id SERIAL NOT NULL PRIMARY KEY,
		guild_id TEXT NOT NULL,
		settlement_id INTEGER REFERENCES Settlements(id) ON DELETE CASCADE,
		thread_id TEXT NOT NULL,
		message_id TEXT,
		panel_message_id TEXT,
		c_name VARCHAR(255) NOT NULL,
		chest VARCHAR(255) NOT NULL DEFAULT 'Pas de lieu de depot specifié.',
		description TEXT NOT NULL DEFAULT 'Une commande de matériaux.',
		self_supplied BOOLEAN NOT NULL DEFAULT FALSE,
		last_edited TIMESTAMPTZ NOT NULL DEFAULT now(),
		author_id TEXT NOT NULL REFERENCES Users(id),
		status VARCHAR(255) NOT NULL DEFAULT 'Building'
	);`,
    `CREATE TABLE IF NOT EXISTS CommandAssignees(
		command_id INTEGER NOT NULL REFERENCES Commands(id) ON DELETE CASCADE,
		user_id TEXT NOT NULL REFERENCES Users(id) ON DELETE CASCADE,
		PRIMARY KEY(command_id, user_id)
	);`,
    `CREATE TABLE IF NOT EXISTS CommandProfessions(
		command_id INTEGER NOT NULL REFERENCES Commands(id) ON DELETE CASCADE,
		profession_name VARCHAR(255) NOT NULL REFERENCES Professions(p_name) ON DELETE CASCADE,
		filled BOOLEAN NOT NULL DEFAULT FALSE,
		PRIMARY KEY (command_id, profession_name)
	);`,
    `CREATE TABLE IF NOT EXISTS CommandItems (
		id SERIAL PRIMARY KEY,
		command_id INTEGER NOT NULL REFERENCES Commands(id) ON DELETE CASCADE,
		item_name TEXT NOT NULL,
		quantity INTEGER NOT NULL DEFAULT 1,
		progress INTEGER NOT NULL DEFAULT 0,
		message_id TEXT
	);`,

    // TRIGGERS

    // Ensure settlement member perm level is owner if owner
    `CREATE OR REPLACE FUNCTION set_owner_settlement_perm_level()
	RETURNS TRIGGER AS $$
	BEGIN
		IF EXISTS (
			SELECT 1 FROM Settlements s
			WHERE s.id = NEW.settlement_id
			AND s.owner_id = NEW.user_id
		) THEN
			NEW.perm_level := -1;
		END IF;
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;`,

    `DROP TRIGGER IF EXISTS set_owner_settlement_perm_level ON SettlementMembers;`,

    `CREATE TRIGGER set_owner_settlement_perm_level
	BEFORE INSERT ON SettlementMembers
	FOR EACH ROW
	EXECUTE FUNCTION set_owner_settlement_perm_level();`,

    // Prevent from changing settlement owner perm level if still owner
    `CREATE OR REPLACE FUNCTION keep_owner_settlement_perm_level()
	RETURNS TRIGGER AS $$
	BEGIN
		IF EXISTS (
			SELECT 1 FROM Settlements s
			WHERE s.id = NEW.settlement_id
			AND s.owner_id = NEW.user_id
		) THEN
			-- Block update
			RAISE EXCEPTION 'Cannot change owner permission level while user is still owner';
		END IF;
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;`,

    `DROP TRIGGER IF EXISTS keep_owner_settlement_perm_level ON SettlementMembers;`,

    `CREATE TRIGGER keep_owner_settlement_perm_level
	BEFORE UPDATE ON SettlementMembers
	FOR EACH ROW
	EXECUTE FUNCTION keep_owner_settlement_perm_level();`,

    // Add owner to known members of new settlement with owner perm level
    `CREATE OR REPLACE FUNCTION add_owner_settlement_perm_level()
	RETURNS TRIGGER AS $$
	BEGIN
		IF NEW.owner_id IS NOT NULL THEN
			INSERT INTO SettlementMembers (settlement_id, user_id, perm_level)
			VALUES (NEW.id, NEW.owner_id, -1)
			ON CONFLICT DO NOTHING; -- in case already exists
		END IF;
		RETURN NEW;
	END;
	$$ LANGUAGE plpgsql;`,

    `DROP TRIGGER IF EXISTS add_owner_settlement_perm_level ON Settlements;`,

    `CREATE TRIGGER add_owner_settlement_perm_level
	AFTER INSERT ON Settlements
	FOR EACH ROW
	EXECUTE FUNCTION add_owner_settlement_perm_level();`,
];

export async function init(): Promise<Database> {
    if (globalThis.__db) return globalThis.__db;
    globalThis.__db = await connect({
        host: process.env.POSTGRES_HOST,
        port: Number(process.env.POSTGRES_PORT),
        user: process.env.POSTGRES_USER,
        database: process.env.POSTGRES_DB,
        password: process.env.POSTGRES_PASSWORD,
        // types ?
        // extraFloatDigits: 0,
        // keepAlive: true,
        // preparedStatementPrefix: 'tsp_',
        // connectionTimeout: 10,
        ssl: SSLMode.Disable,
    });

    process.on("exit", () => {
        try {
        } catch (err) {
            console.error("Checkpoint failed on exit:", err);
        }
        db().end().catch(console.log);
    });
    process.on("SIGINT", () => {
        try {
        } catch (err) {
            console.error("Checkpoint failed on exit:", err);
        }
        db().end().catch(console.log);
        process.exit();
    });
    process.on("SIGTERM", () => {
        try {
        } catch (err) {
            console.error("Checkpoint failed on exit:", err);
        }
        db().end().catch(console.log);
        process.exit();
    });

    // Make sure every table exists correctly
    console.log("[STARTUP] Making sure DB schema is correct...");
    for (const table of tables) {
        try {
            await db().query(table);
        } catch (err) {
            console.log(table);
            throw err;
        }
    }
    console.log("[STARTUP] If no errors, then schema is correct.");

    return globalThis.__db;
}
