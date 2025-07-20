// UNFINISHED: simple ORM attempt

import { db } from "./dbConn";
import Database from "better-sqlite3";

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
};

class Model {
    [key: string]: any;

    private _inserted: boolean = false;

    get name(): string {
        return this.constructor.name;
    }
    get table(): string {
        return `${this.constructor.name}s`;
    }

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
        for (const key in row) {
            this[key] = row[key];
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
            values = Array.isArray(options.values)
                ? options.values
                : [options.values];

            // Safeguard
            if (keys.length !== values.length || keys.length === 0)
                throw new Error(
                    "Couldn't build query, keys don't match values length.",
                );

            // Set WHERE clause
            whereStr += "WHERE";
            whereStr += keys.map((k: string) => ` ${k} = ?`).join(" AND");
        }

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
        if (!rows || rows.length === 0) return null;
        const instances: InstanceType<T>[] = rows.map((row) => {
            const inst = new this() as InstanceType<T>;
            inst.assign(row);

            // Mark it as inserted (to avoid errors)
            inst._inserted = true;
            return inst;
        });

        return instances.length === 1 ? instances[0] : instances;
    }

    // Get new data from database relative to this specific instance
    public sync(): boolean {
        const table = this.table;
        const pks: string[] = Model.getPrimaryKeys(table);

        const values = pks.map(
            (k: string): number | bigint | string | Date => this[k],
        );

        const row: any[] = this.ctor.selectQuery({
            keys: pks,
            values: values,
            table: table,
            limit: 1,
        });

        if (row && row.length > 0) {
            this.assign(row[0]);
            return true;
        }
        return false;
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
                values.push(v);
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
            .join(" AND");

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
                values.push(val);
            }
        }

        if (fields.length === 0 || values.length !== fields.length) return;

        const placeholders = fields.map(() => "?").join(", ");
        const columns = fields.join(", ");

        const sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;

        try {
            const res: Database.RunResult = db.prepare(sql).run(...values);
            this._inserted = true;
            return res.changes === 1 ? this : undefined;
        } catch (err) {
            console.error(`[DB] Insert: something went wrong\n`, err);
            return;
        }
    }
}

export class User extends Model {
    public id!: string | bigint;
    public username?: string | undefined;
    public bot_perm?: number | string | undefined;
}

export class ChannelParam extends Model {
    public chan_id!: string | bigint;
    public guild_id!: string | bigint;
    public command_name!: string;
    public command_param!: string;

    public toString(): string {
        return `${this.command_name}(${this.command_param}): Channel ${this.chan_id} from Guild ${this.guild_id}`;
    }
}
