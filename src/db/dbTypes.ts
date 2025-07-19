import { db, ready } from "./dbConn";

export type DbOptions = {
    keys?: string[] | string | null;
    values?:
        | (number | bigint | string | Date)[]
        | number
        | bigint
        | string
        | Date
        | null;
    table?: string | null;
    limit?: number | bigint | string | null;
};

class Model {
    [key: string]: any;

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
                    "Couldn't build query, keys don't mathc values length.",
                );

            // Set WHERE clause
            whereStr += "WHERE";
            whereStr += keys.map((k: string) => ` ${k} = ?`).join(" AND");
        }

        return db
            .prepare(`SELECT * FROM ${table} ${whereStr} ${limit}`)
            .all(values);
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
            return inst;
        });

        return instances.length === 1 ? instances[0] : instances;
    }

    // Get new data from database relative to this specific instance
    public sync(): void {
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

        if (row && row.length > 0) this.assign(row[0]);
        else throw new Error("Failed fetching data from database.");
    }

    // Update database with new data of this new instance
    public update(): void {}

    // Create a new row in the corresponding table, and returns the associated instance
    public static insert<T extends typeof Model>(this: T): InstanceType<T> {
        // Placeholder
        return new this() as InstanceType<T>;
    }
}

export class User extends Model {
    public id!: number;
    public username!: string;
}
