// UNFINISHED: simple ORM attempt

import { APIEmbedField } from "discord.js";
import { db } from "./dbConn";
import Database from "better-sqlite3";
import { getParisDatetimeSQLiteSafe } from "../utils/taskUtils";
import { getEmoji } from "../utils/discordUtils";
import { sendCommands } from "../utils/commandLoader";

export const relaodDummyDbTypes = "...";

export type DbOptionsValue =
    | number
    | bigint
    | string
    | boolean
    | Date
    | null
    | typeof IS_NOT_NULL
    | typeof IS_NULL;

export type DbOptions = {
    keys?: string[] | string | null;
    values?: DbOptionsValue[] | DbOptionsValue | null;

    table?: string | null;
    limit?: number | bigint | string | null;
    array?: boolean | null;
    noNull?: boolean | null;
};

export type FieldType = "string" | "bigint" | "number" | "boolean" | "Date";
export const IS_NOT_NULL = Symbol("IS_NOT_NULL");
export const IS_NULL = Symbol("IS_NULL");

export class Model {
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
        const tv = typeof v;
        return (
            tv === "number" ||
            tv === "bigint" ||
            tv === "string" ||
            tv === "boolean" ||
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
        console.log(v, typeof v);
        throw new Error("Unreachable exception");
    }

    private static buildWhereClause(
        keys?: null | string | string[],
        values?: null | DbOptionsValue | DbOptionsValue[],
        noNull?: boolean | null,
    ): { whereClause: string; values: (string | number | bigint)[] } {
        if (!keys || !values) return { whereClause: "", values: [] };
        if (!Array.isArray(keys)) keys = [keys];
        if (!Array.isArray(values)) values = [values];

        const retVals: (string | number | bigint)[] = [];
        let str = "WHERE ";

        str += keys
            .map((k, i) => {
                const v = values[i];
                if (v === IS_NOT_NULL) return `${k} IS NOT NULL`;
                else if (v === IS_NULL || v === null) {
                    if (noNull)
                        throw new Error(
                            `[DB] Build where clause: null value for ${k} not authorised in this query.`,
                        );
                    return `${k} IS NULL`;
                } else if (Model.isSafeDBValue(v)) {
                    retVals.push(Model.sanitize(v!));
                    return `${k} = ?`;
                } else
                    throw new Error(
                        `[DB] Build where clause: unsafe value for key ${k} (${v})`,
                    );
            })
            .join(" AND ");

        return { whereClause: str, values: retVals };
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
        // console.log(row);
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
                default:
                    this[key] = v;
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
        const { whereClause, values } = Model.buildWhereClause(
            options?.keys,
            options?.values,
            options?.noNull,
        );
        const sql = `SELECT * FROM ${table} ${whereClause} ${limit}`;

        return db.prepare(sql).all(...values);
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

    public static fetchArray<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): InstanceType<T>[] {
        const opts: DbOptions = options ?? {};
        opts.array = true;
        return this.fetch(opts) as InstanceType<T>[];
    }

    public static get<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): InstanceType<T> | null {
        const opts: DbOptions = options ?? {};
        opts.limit = 1;
        return this.fetch(opts) as InstanceType<T> | null;
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
                noNull: true,
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
        let nc = 0;
        rawUks.forEach((k: string): void => {
            const v: any = this[k];
            if (Model.isSafeDBValue(v)) {
                uks.push(k);
                // Convert booleans & date (no native support)
                values.push(Model.sanitize(v));
            } else if (v === null) {
                uks.push(k);
                nc++;
            }
        });

        // Safeguard (if somehow something weird happens ?)
        if (
            pks.length != pkValues.length ||
            pks.length === 0 ||
            uks.length != values.length + nc || // To allow for NULL updates
            uks.length == 0
        )
            return false;

        // Build SET clause
        const setClause: string = uks
            .map((k: string): string =>
                this[k] === null ? `${k} = NULL` : `${k} = ?`,
            )
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

    // Check if an instance exists in the database
    public exists(): boolean {
        const fields = Object.keys(this).filter(
            (k: string): boolean =>
                typeof this[k] !== "function" &&
                !k.startsWith("_") &&
                !["table", "name", "ctor"].includes(k) &&
                this[k] !== undefined &&
                (Model.isSafeDBValue(this[k]) || this[k] === null),
        );

        if (fields.length === 0) return false;

        const values = fields
            .filter((k) => this[k] !== null)
            .map((k) => Model.sanitize(this[k]));

        const whereClause = fields
            .map((k) => (this[k] === null ? `${k} IS NULL` : `${k} = ?`))
            .join(" AND ");
        const sql = `SELECT 1 FROM ${this.table} WHERE ${whereClause} LIMIT 1`;

        try {
            const row = db.prepare(sql).get(...values);
            return !!row;
        } catch (err) {
            console.error(`[DB] Exists check failed:\n`, err);
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

type _cpCacheKeysType = (number | bigint | string | null)[];
export class ChannelParam extends Model {
    public id!: number;
    public channel_id!: string;
    public guild_id!: string;
    public settlement_id?: number | bigint | string | null;
    public command_name!: string;
    public command_param!: string;

    public toString(): string {
        return (
            `${this.command_name}(${this.command_param}): Channel <#${this.channel_id}> from Guild ${this.guild_id}` +
            (this.settlement_id ? `(claim id ${this.settlement_id})` : "")
        );
    }

    public static _paramsCache = new Map<
        _cpCacheKeysType,
        { param: ChannelParam; lastEdited: number }
    >();

    public static getParam(
        guildId: string,
        commandName: string,
        paramName: string,
        settlementId?: number | bigint | string | null,
    ): ChannelParam | null {
        // settlementId safety
        settlementId ??= null;

        // Check cache
        const res = ChannelParam._paramsCache.get([
            guildId,
            commandName,
            paramName,
            settlementId,
        ]);

        // If in cache
        if (res) {
            const { param, lastEdited } = res;
            // If has been fetched already in the last minute
            if (lastEdited + 60 * 1_000 >= Date.now()) return param;
        }

        // If has not been fetched recently/at all

        // Set Where clause
        const keys = [
            "guild_id",
            "command_name",
            "command_param",
            "settlement_id",
        ];
        const values: _cpCacheKeysType = [
            guildId,
            commandName,
            paramName,
            settlementId,
        ];

        // Get res
        const resQ = ChannelParam.get({
            keys: keys,
            values: values,
        });

        if (!settlementId) values.push(null);

        // Check that it exists
        if (!resQ) {
            if (ChannelParam._paramsCache.has(values))
                ChannelParam._paramsCache.delete(values);
            return null;
        }
        ChannelParam._paramsCache.set(values, {
            param: resQ,
            lastEdited: Date.now(),
        });
        return resQ;
    }

    public override insert(): this | undefined {
        const res = super.insert();
        if (res && this.guild_id && this.command_name && this.command_param) {
            const keys: _cpCacheKeysType = [
                this.guild_id,
                this.command_name,
                this.command_param,
                this.settlement_id ?? null,
            ];
            ChannelParam._paramsCache.set(keys, {
                param: this,
                lastEdited: Date.now(),
            });
        }
        return res;
    }

    public override update(): boolean {
        const res = super.update();
        if (res && this.guild_id && this.command_name && this.command_param) {
            const keys: _cpCacheKeysType = [
                this.guild_id,
                this.command_name,
                this.command_param,
                this.settlement_id ?? null,
            ];
            ChannelParam._paramsCache.set(keys, {
                param: this,
                lastEdited: Date.now(),
            });
        }
        return res;
    }

    public override delete(): boolean {
        const res = super.delete();
        if (res && this.guild_id && this.command_name && this.command_param) {
            const keys: _cpCacheKeysType = [
                this.guild_id,
                this.command_name,
                this.command_param,
                this.settlement_id ?? null,
            ];
            ChannelParam._paramsCache.delete(keys);
        }
        return res;
    }
}

export class Profession extends Model {
    public p_name!: string;
    public kind!: string;
    public description!: string;
    public emoji!: string;

    public toString(): string {
        return this.p_name;
    }
}

export class Fournisseur extends Model {
    public user_id!: string;
    public guild_id!: string;
    public settlement_id?: number | bigint | string | null;
    public coordinator!: boolean;
    public profession_name!: string;

    override fieldTypes: Record<string, FieldType> = {
        coordinator: "boolean",
    };

    public toString(discord?: boolean): string {
        const setl = this.settlement_id
            ? Settlement.get({ keys: "id", values: this.settlement_id })
            : null;
        return discord
            ? `- **${this.coordinator ? "🔧 Coordinateur" : "Fournisseur"}** de __${this.profession_name}__ ${this.settlement_id ? `*(${setl?.s_name})*` : ""}`
            : `${this.coordinator ? "🔧 Coordinateur" : "Fournisseur"} de ${this.profession_name} ${this.settlement_id ? `(${setl?.s_name})` : ""}`;
    }
}

export class Skill extends Model {
    public user_id!: string;
    public xp!: number | string;
    public level!: number | string;
    public profession_name!: string;

    public format(): APIEmbedField {
        return {
            name:
                `${getEmoji(this.profession_name)} ${this.profession_name}` +
                (() => {
                    let str = "";
                    let i = 9 - this.profession_name.length;
                    while (i-- > 0) str += "ㅤ";
                    return str;
                })(),
            value: `Level **${this.level}**\n-# *(${this.xp} XP)*`,
            inline: true,
        };
    }
}

export class Command extends Model {
    public id!: number | bigint | string;
    public guild_id!: string;
    public settlement_id?: number | bigint | string | null;
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
    public id!: number | bigint | string;
    public command_id!: number | bigint | string;
    public item_name!: string;
    public quantity!: number;
    public progress!: number;
    public message_id?: string | undefined;
}

export class CommandProfession extends Model {
    public command_id!: number | bigint | string;
    public profession_name!: string;
    public filled!: boolean;
}

export class CommandAssignee extends Model {
    public command_id!: number | bigint | string;
    public user_id!: string;
}

export class Settlement extends Model {
    public id!: number | bigint | string;
    public guild_id!: string;
    public s_name!: string;
    public owner_id!: string | null;
    public member_count!: number;

    public override insert(): this | undefined {
        const res = super.insert();
        if (res) sendCommands(this.guild_id).catch(console.log);
        return res;
    }

    public override update(): boolean {
        const res = super.update();
        if (res) sendCommands(this.guild_id).catch(console.log);
        return res;
    }

    public override delete(): boolean {
        const res = super.delete();
        if (res) sendCommands(this.guild_id).catch(console.log);
        return res;
    }
}

export class SettlementMember extends Model {
    public settlement_id!: number | bigint | string | null;
    public user_id!: string;
    public perm_level!: number;
}

export enum SkillKind {
    Profession = "profession",
    Gather = "profession",
    Refine = "profession",
    Skill = "skill",
}

//console.log(SkillKind);
//console.log(SkillKind.Profession);

// Add professions
export function changeProfs() {
    for (const [n, k, d, e] of [
        [
            "Forestry",
            SkillKind.Gather,
            "Bûcheron",
            "<:skill_forestry:1400969700925771787>",
        ],
        [
            "Carpentry",
            SkillKind.Refine,
            "Charpentier",
            "<:skill_carpentry:1400969531857309726>",
        ],
        [
            "Masonry",
            SkillKind.Refine,
            "Maçon",
            "<:skill_masonry:1400969755904442569>",
        ],
        [
            "Mining",
            SkillKind.Gather,
            "Mineur",
            "<:skill_mining:1400969776494542888>",
        ],
        [
            "Smithing",
            SkillKind.Refine,
            "Forgeron",
            "<:skill_smithing:1400969823516753920>",
        ],
        [
            "Scholar",
            SkillKind.Refine,
            "Savant",
            "<:skill_scholar:1400969804977799168>",
        ],
        [
            "Leatherworking",
            SkillKind.Refine,
            "Tanneur",
            "<:skill_leatherworking:1400969735029526608>",
        ],
        [
            "Hunting",
            SkillKind.Gather,
            "Chasseur",
            "<:skill_hunting:1400969717371375796>",
        ],
        [
            "Tailoring",
            SkillKind.Refine,
            "Tisserand",
            "<:skill_tailoring:1400969842479071354>",
        ],
        [
            "Farming",
            SkillKind.Refine,
            "Fermier",
            "<:skill_farming:1400969632772259890>",
        ],
        [
            "Fishing",
            SkillKind.Gather,
            "Pêcheur",
            "<:skill_fishing:1400969663763972157>",
        ],
        [
            "Cooking",
            SkillKind.Skill,
            "Cuistot",
            "<:skill_cooking:1400969611943350272>",
        ],
        [
            "Foraging",
            SkillKind.Gather,
            "Ceuilleur",
            "<:skill_foraging:1400969681640226967>",
        ],
        ["Construction", SkillKind.Skill, "Construction", "🛠️"],
        ["Taming", SkillKind.Skill, "Eleveur", "🐑"],
        ["Slayer", SkillKind.Skill, "Massacreur", "☠️"],
        ["Merchanting", SkillKind.Skill, "Marchand", "💰"],
        ["Sailing", SkillKind.Skill, "Navigateur", "⛵"],
    ]) {
        db.prepare(
            `
            INSERT INTO Professions(p_name, kind, description, emoji)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(p_name) DO NOTHING;
        `,
        ).run(n, k, d, e);
        db.prepare(
            `UPDATE Professions 
            SET kind = ?, description = ?, emoji = ?
            WHERE p_name = ?;`,
        ).run(k, d, e, n);
    }
}

changeProfs();

//console.log(Profession.fetchArray());
