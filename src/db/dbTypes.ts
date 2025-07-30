// UNFINISHED: simple ORM attempt

import { Client } from "discord.js";
import { db } from "./dbConn";
import Database from "better-sqlite3";
import { getParisDatetimeSQLiteSafe } from "../utils/taskUtils";

export type DbOptions = {
    keys?: string[] | string | null;
    values?:
        | (number | bigint | string | boolean | Date)[]
        | number
        | bigint
        | string
        | boolean
        | Date
        | null;
    table?: string | null;
    limit?: number | bigint | string | null;
    array?: boolean | null;
};

type FieldType = "string" | "bigint" | "number" | "boolean" | "Date";

class Model {
    [key: string]: any;

    private _inserted: boolean = false;

    get name(): string {
        return this.constructor.name;
    }
    get table(): string {
        return `${this.constructor.name}s`;
    }

    // For assignment
    fieldTypes: Record<string, FieldType> = {};

    // For instances calling static methods that rely on polymorphism
    protected get ctor(): typeof Model {
        return this.constructor as typeof Model;
    }

    private static _primaryKeysCache: Map<string, string[]> = new Map();

    private static isSafeDBValue(v: any): boolean {
        return (
            ["number", "bigint", "string", "boolean"].includes(typeof v) ||
            v instanceof Date
        );
    }

    private static sanitize(
        v: number | bigint | string | boolean | Date,
    ): number | string {
        if (["number", "string"].includes(typeof v))
            return v as number | string;
        if (typeof v === "bigint") return `${v}`;
        if (typeof v === "boolean") return v ? 1 : 0;
        if (v instanceof Date) return getParisDatetimeSQLiteSafe(v);
        throw new Error("Unreachable exception");
    }

    public static getPrimaryKeys(table: string): string[] {
        if (!Model._primaryKeysCache.has(table)) {
            const columns: any = db.pragma(`table_info(${table})`);
            const pkColumns = columns.filter((col: any) => col.pk > 0);

            if (pkColumns.length === 0) {
                throw new Error(`No primary key found for table ${table}`);
            }

            Model._primaryKeysCache.set(
                table,
                pkColumns.map((col: any) => col.name),
            );
        }

        return Model._primaryKeysCache.get(table)!;
    }

    private assign(row: any) {
        console.log(row);
        for (const key in row) {
            const v = row[key];
            if (!this.fieldTypes || !this.fieldTypes[key]) {
                this[key] = v;
                continue;
            }
            switch (this.fieldTypes[key]) {
                case "boolean":
                    this[key] = v === 1 || v === "1";
                    break;
                case "Date":
                    this[key] = v ? new Date(v) : v;
                    break;
            }
        }
    }

    private static selectQuery<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): any[] {
        // Set query parameters
        const table =
            options && options.table != null ? options.table : `${this.name}s`;
        const limit = options && options.limit ? `LIMIT ${options.limit}` : "";

        // Build WHERE clause
        let whereStr: string = "";
        let values: unknown[] = [];
        if (options && options.keys && options.values) {
            // Normalize WHERE parameters input
            const keys = Array.isArray(options.keys)
                ? options.keys
                : [options.keys];
            values = (
                Array.isArray(options.values)
                    ? options.values
                    : [options.values]
            )
                // Typeguard (sqlite doesn't support boolean)
                .map((v) => Model.sanitize(v));

            // Safeguard
            if (keys.length !== values.length || keys.length === 0)
                throw new Error(
                    "Couldn't build query, keys don't match values length.",
                );

            // Set WHERE clause
            whereStr += "WHERE";
            whereStr += keys.map((k: string) => ` ${k} = ?`).join(" AND");
        }

        /*
		console.log("==============");
		console.log(this);
		console.log(values);
		values.forEach((v) => console.log(v, typeof v));
		console.log("==============");
		*/

        return db
            .prepare(`SELECT * FROM ${table} ${whereStr} ${limit}`)
            .all(...values);
    }

    // Get one or all of type from database that match a where clause
    // Number of keys must match number of values
    public static fetch<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): InstanceType<T>[] | InstanceType<T> | null {
        // Fetch data
        const rows: unknown[] = this.selectQuery(options);

        // Build instances
        if (!rows || rows.length === 0)
            return options && options.array ? [] : null;
        const instances: InstanceType<T>[] = rows.map((row) => {
            const inst = new this() as InstanceType<T>;
            inst.assign(row);

            // Mark it as inserted (to avoid errors)
            inst._inserted = true;
            return inst;
        });
        if (options && options.array) return instances;
        return instances.length === 1 ? instances[0] : instances;
    }

    // Get new data from database relative to this specific instance
    public sync(): boolean {
        const table = this.table;
        const pks: string[] = Model.getPrimaryKeys(table);

        const values = pks.map(
            (k: string): number | bigint | string | Date => this[k],
        );

        try {
            const row: any[] = this.ctor.selectQuery({
                keys: pks,
                values: values,
                table: table,
                limit: 1,
            });

            if (row && row.length > 0) {
                this.assign(row[0]);
                this._inserted = true;
                return true;
            }

            return false;
        } catch (err) {
            console.error(`[DB] Sync: Error in selectQuery:\n`, err);
            return false;
        }
    }

    // Update database with new data of this new instance
    public update(): boolean {
        const table = this.table;

        // Set keys
        // Primary keys (fetched from DB)
        const pks: string[] = Model.getPrimaryKeys(table);
        if (pks.length === 0) return false;

        // Unsafe or virtual user-defined fields
        const rawUks: string[] = Object.keys(this).filter(
            (k: string): boolean =>
                typeof this[k] != "function" &&
                !pks.includes(k) &&
                !k.startsWith("_") &&
                !["table", "name", "ctor"].includes(k),
        );
        // Validated fields
        const uks: string[] = [];

        // Set values arrays
        // Primary keys values (WHERE clause)
        const pkValues = pks.map((k: string): any => this[k]);
        if (pkValues.some((v) => !Model.isSafeDBValue(v))) return false;

        // Non-primary keys values (SET clause)
        const values: any[] = [];
        rawUks.forEach((k: string): void => {
            const v: any = this[k];
            if (Model.isSafeDBValue(v)) {
                uks.push(k);
                // Convert booleans to 0 or 1 (no native support)
                values.push(Model.sanitize(v));
            }
        });

        // Safeguard (if somehow something weird happens ?)
        if (
            pks.length != pkValues.length ||
            pks.length === 0 ||
            uks.length != values.length ||
            uks.length == 0
        )
            return false;

        // Build SET clause
        const setClause: string = uks
            .map((k: string): string => `${k} = ?`)
            .join(", ");

        // Build WHERE clause
        const whereClause: string = pks
            .map((k: string): string => `${k} = ?`)
            .join(" AND ");

        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause}`;
        try {
            const res: Database.RunResult = db
                .prepare(sql)
                .run(...values, ...pkValues);
            return res.changes === 1;
        } catch (err) {
            console.error(`[DB] Update: something went wrong\n`, err);
            return false;
        }
    }

    // Create a new row in the corresponding table, and returns the associated instance
    public insert(): this | undefined {
        if (this._inserted) return this; // Can only insert once (Primary Unique Key Constraint)
        const table = this.table;

        // All insertable fields
        const rawFields = Object.keys(this).filter(
            (k: string): boolean =>
                typeof this[k] !== "function" &&
                !k.startsWith("_") &&
                !["table", "name", "ctor"].includes(k),
        );

        const fields: string[] = [];
        const values: any[] = [];

        // Validate values
        for (const key of rawFields) {
            const val = this[key];
            if (Model.isSafeDBValue(val)) {
                fields.push(key);
                // Convert booleans to 0 or 1 (no native support)
                values.push(Model.sanitize(val));
            }
        }

        if (fields.length === 0 || values.length !== fields.length) return;

        const placeholders = fields.map(() => "?").join(", ");
        const columns = fields.join(", ");

        const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

        try {
            const res: Database.RunResult = db.prepare(sql).run(...values);
            this._inserted = true;

            if (Object.keys(this).includes("id") && !this["id"]) {
                this["id"] = (
                    db.prepare("SELECT last_insert_rowid()").get() as any
                )["last_insert_rowid()"];
            }

            return res.changes === 1 ? this : undefined;
        } catch (err) {
            console.error(`[DB] Insert: something went wrong\n`, err);
            return;
        }
    }

    // Remove entry from database
    public delete(): boolean {
        const table = this.table;

        // Delete based on primary keys
        const pks: string[] = Model.getPrimaryKeys(table);
        const values: any[] = [];
        pks.forEach((k: string): any => {
            const v: any = this[k];
            if (Model.isSafeDBValue(v)) values.push(Model.sanitize(v));
        });

        // Safeguard (if user did some wonky stuff with the class attributes)
        if (pks.length === 0 || pks.length != values.length) return false;

        const whereClause: string = pks
            .map((k: string): string => `${k} = ?`)
            .join(" AND ");
        const sql: string = `DELETE FROM ${table} WHERE ${whereClause}`;
        try {
            const res: Database.RunResult = db.prepare(sql).run(...values);
            return res.changes > 0;
        } catch (err) {
            console.error(`[DB] Delete: something went wrong\n`, err);
            return false;
        }
    }
}

export class User extends Model {
    public id!: string;
    public player_id?: string | undefined;
    public username!: string;
    public player_username!: string;
    public bot_perm!: number | string;
    public last_updated_skills?: Date | undefined;

    public static ensureUserExists(
        userId: string,
        username: string,
        botPerm: number | bigint = 0,
    ) {
        db.prepare(
            `
			INSERT INTO Users(id, username, bot_perm)
			VALUES (?, ?, ?)
			ON CONFLICT(id) DO NOTHING;
		`,
        ).run(userId, username, botPerm);
    }

    override fieldTypes: Record<string, FieldType> = {
        last_updated_skills: "Date",
    };
}

export class ChannelParam extends Model {
    public channel_id!: string;
    public guild_id!: string;
    public command_name!: string;
    public command_param!: string;

    public toString(): string {
        return `${this.command_name}(${this.command_param}): Channel <#${this.channel_id}> from Guild ${this.guild_id}`;
    }
}

export class Profession extends Model {
    public p_name!: string;
    public description!: string;

    public toString(): string {
        return this.p_name;
    }
}

export class Fournisseur extends Model {
    public user_id!: string;
    public guild_id!: string;
    public coordinator!: boolean;
    public profession_name!: string;

    override fieldTypes: Record<string, FieldType> = {
        coordinator: "boolean",
    };
}

export class Skill extends Model {
    public user_id!: string;
    public xp!: number | bigint | string;
    public level!: number | bigint | string;
    public profession_name!: string;
}

export class Command extends Model {
    public id!: number | bigint | string;
    public guild_id!: string;
    public thread_id!: string;
    public message_id?: string | undefined;
    public panel_message_id?: string | undefined;
    public c_name!: string;
    public chest!: string;
    public description!: string;
    public self_supplied: boolean = false;
    public last_edited!: Date;
    public author_id!: string;
    public status!: string;

    override fieldTypes: Record<string, FieldType> = {
        last_edited: "Date",
        self_supplied: "boolean",
    };
}

export class CommandItem extends Model {
    public command_id!: number | bigint | string;
    public item_name!: string;
    public quantity: number = 1;
}

export class CommandProfession extends Model {
    public command_id!: number | bigint | string;
    public profession_name!: string;
}

export class CommandAssignee extends Model {
    public command_id!: number | bigint | string;
    public user_id!: string;
}

export type Config = {
    locked: boolean;
    bot: Client;
    db: Database.Database;
    admins: Array<string>;
    [key: string]: any;
};

// Add professions
for (const [n, d] of [
    ["Forestry", "Bûcheron"],
    ["Carpentry", "Charpentier"],
    ["Masonry", "Maçon"],
    ["Mining", "Mineur"],
    ["Smithing", "Forgeron"],
    ["Scholar", "Savant"],
    ["Leatherworking", "Tanneur"],
    ["Hunting", "Chasseur"],
    ["Tailoring", "Tisserand"],
    ["Farming", "Fermier"],
    ["Fishing", "Pêcheur"],
    ["Cooking", "Cuistot"],
    ["Foraging", "Ramasseur"],
    ["Construction", "Construction"],
    ["Taming", "Eleveur"],
    ["Slayer", "Massacreur"],
    ["Merchanting", "Marchand"],
    ["Sailing", "Navigateur"],
]) {
    db.prepare(
        `
		INSERT INTO Professions(p_name, description)
		VALUES (?, ?)
		ON CONFLICT(p_name) DO NOTHING;
	`,
    ).run(n, d);
    /*
	const p = new Profession();
	p.p_name = n;
	p.description = d;
	p.insert();
	*/
}

console.log(User.fetch());

/*

const chanParam = new ChannelParam();
chanParam.channel_id = "1396511696859693087";
chanParam.guild_id = "877114572337725441";
chanParam.command_name = "test_chan_param";
chanParam.command_param = "param1";
chanParam.insert();

const chanParam1 = new ChannelParam();
chanParam1.channel_id = "22222222";
chanParam1.guild_id = "877114572337725441";
chanParam1.command_name = "test_chan_param";
chanParam1.command_param = "param2";
chanParam1.insert();

const chanParam2 = new ChannelParam();
chanParam2.channel_id = "1396511696859693087";
chanParam2.guild_id = "877114572337725441";
chanParam2.command_name = "test_chan_param_numero2";
chanParam2.command_param = "param1";
chanParam2.insert();

const chanParam3 = new ChannelParam();
chanParam3.channel_id = "1234";
chanParam3.guild_id = "12345";
chanParam3.command_name = "etst2";
chanParam3.command_param = "test";
chanParam3.insert();

*/
