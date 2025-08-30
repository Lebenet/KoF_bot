// UNFINISHED: simple ORM attempt

import { APIEmbedField } from "discord.js";
import { db as getDb } from "./dbConn";
import { getParisDatetimeSQLiteSafe } from "../utils/taskUtils";
import { getEmoji } from "../utils/discordUtils";
import { sendCommands } from "../utils/commandLoader";
import { ResultRecord, ResultRow } from "ts-postgres";

const db = () => getDb();

export const relaodDummyDbTypes = "...";

export type DbValue = number | bigint | string | boolean;

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

    public _inserted: boolean = false;

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
    ): DbValue {
        if (["number", "string", "boolean"].includes(typeof v))
            return v as number | string | boolean;
        if (typeof v === "bigint") return `${v}`;
        //if (typeof v === "boolean") return v ? 1 : 0;
        if (v instanceof Date) return getParisDatetimeSQLiteSafe(v);
        console.log(v, typeof v);
        throw new Error("Unreachable exception");
    }

    private static buildWhereClause(
        keys?: null | string | string[],
        values?: null | DbOptionsValue | DbOptionsValue[],
        noNull?: boolean | null,
    ): { whereClause: string; values: DbValue[] } {
        if (!keys || !values) return { whereClause: "", values: [] };
        if (!Array.isArray(keys)) keys = [keys];
        if (!Array.isArray(values)) values = [values];

        const retVals: DbValue[] = [];
        let str = "WHERE ";

        let j = 1;

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
                } else if (typeof v === "string" && /^\s*LIKE\s+/i.test(v)) {
                    const pattern = v.replace(/^\s*LIKE\s+/i, "");
                    retVals.push(pattern);
                    return `${k} LIKE $${j++}`;
                } else if (
                    typeof v === "string" &&
                    /^\s*NOT\s+LIKE\s+/i.test(v)
                ) {
                    const pattern = v.replace(/^\s*NOT\s+LIKE\s+/i, "");
                    retVals.push(pattern);
                    return `${k} NOT LIKE $${j++}`;
                } else if (Model.isSafeDBValue(v)) {
                    retVals.push(Model.sanitize(v!));
                    return `${k} = $${j++}`;
                } else
                    throw new Error(
                        `[DB] Build where clause: unsafe value for key ${k} (${v})`,
                    );
            })
            .join(" AND ");

        return { whereClause: str, values: retVals };
    }

    public static async getPrimaryKeys(table: string): Promise<string[]> {
        if (!Model._primaryKeysCache.has(table)) {
            const query = `
                SELECT kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                  AND tc.table_name = $1
                  AND tc.table_schema = 'public'
                ORDER BY kcu.ordinal_position;
            `;

            const result = await db().query(query, [table]);
            const pkColumns = Array.from(result).map(
                (row) => row.get("column_name") as string,
            );

            if (pkColumns.length === 0) {
                throw new Error(`No primary key found for table ${table}`);
            }

            Model._primaryKeysCache.set(table, pkColumns);
        }

        return Model._primaryKeysCache.get(table)!;
    }

    private assign(row: ResultRecord<any> | ResultRow<any>): void {
        // console.log(row);
        for (const key in row.keys()) {
            const v = row.get(key);
            if (!this.fieldTypes || !this.fieldTypes[key]) {
                this[key] = v;
                continue;
            }
            switch (this.fieldTypes[key]) {
                //case "boolean":
                //    this[key] = v === 1 || v === "1";
                //    break;
                case "Date":
                    this[key] = v ? new Date(v) : v;
                    break;
                default:
                    this[key] = v;
            }
        }
    }

    private static async selectQuery<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): Promise<ResultRow<T>[]> {
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

        if (!db) throw new Error("DB not initialized");
        return (await db().query<T>(sql, values)).rows;
    }

    // Get one or all of type from database that match a where clause
    // Number of keys must match number of values
    public static async fetch<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): Promise<InstanceType<T>[] | InstanceType<T> | null> {
        // Fetch data
        const rows: ResultRow<T>[] = await this.selectQuery(options);

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

    public static async fetchArray<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): Promise<InstanceType<T>[]> {
        const opts: DbOptions = options ?? {};
        opts.array = true;
        return (await this.fetch(opts)) as InstanceType<T>[];
    }

    public static async get<T extends typeof Model>(
        this: T,
        options?: DbOptions | null,
    ): Promise<InstanceType<T> | null> {
        const opts: DbOptions = options ?? {};
        opts.limit = 1;
        return (await this.fetch(opts)) as InstanceType<T> | null;
    }

    // Get new data from database relative to this specific instance
    public async sync(): Promise<boolean> {
        const table = this.table;
        const pks: string[] = await Model.getPrimaryKeys(table);

        const values = pks.map(
            (k: string): number | bigint | string | Date => this[k],
        );

        try {
            const row = await this.ctor.selectQuery({
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
    public async update(): Promise<boolean> {
        const table = this.table;

        // Set keys
        // Primary keys (fetched from DB)
        const pks: string[] = await Model.getPrimaryKeys(table);
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

        let j = 1;
        // Build SET clause
        const setClause: string = uks
            .map((k: string): string =>
                this[k] === null ? `${k} = NULL` : `${k} = $${j++}`,
            )
            .join(", ");

        // Build WHERE clause
        const whereClause: string = pks
            .map((k: string): string => `${k} = $${j++}`)
            .join(" AND ");

        const sql = `UPDATE ${table} SET ${setClause} WHERE ${whereClause} RETURNING *;`;

        try {
            const res = await db().query(sql, [...values, ...pkValues]);
            return res.rows.length === 1;
        } catch (err) {
            console.error(`[DB] Update: something went wrong\n`, err);
            return false;
        }
    }

    // Create a new row in the corresponding table, and returns the associated instance
    public async insert(): Promise<this | undefined> {
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

        let j = 1;
        const placeholders = fields.map(() => `$${j++}`).join(", ");
        const columns = fields.join(", ");

        let sql = `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`;
        if (Object.keys(this).includes("id") && !this["id"])
            sql += " RETURNING id";
        sql += ";";

        try {
            const res = await db().query(sql, values);
            if (res.rows.length !== 1) return undefined;
            this._inserted = true;

            if (Object.keys(this).includes("id") && !this["id"]) {
                this["id"] = res.rows[0].get("id");
            }
            return this;
        } catch (err) {
            console.error(`[DB] Insert: something went wrong\n`, err);
            return;
        }
    }

    // Remove entry from database
    public async delete(): Promise<boolean> {
        const table = this.table;

        // Delete based on primary keys
        const pks: string[] = await Model.getPrimaryKeys(table);
        const values: any[] = [];
        pks.forEach((k: string): any => {
            const v: any = this[k];
            if (Model.isSafeDBValue(v)) values.push(Model.sanitize(v));
        });

        // Safeguard (if user did some wonky stuff with the class attributes)
        if (pks.length === 0 || pks.length != values.length) return false;

        let j = 1;
        const whereClause: string = pks
            .map((k: string): string => `${k} = $${j++}`)
            .join(" AND ");
        const sql: string = `DELETE FROM ${table} WHERE ${whereClause} RETURNING *;`;
        try {
            const res = await db().query(sql, values);
            return res.rows.length > 0;
        } catch (err) {
            console.error(`[DB] Delete: something went wrong\n`, err);
            return false;
        }
    }

    // Check if an instance exists in the database
    public async exists(): Promise<boolean> {
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

        let j = 1;
        const whereClause = fields
            .map((k) => (this[k] === null ? `${k} IS NULL` : `${k} = $${j++}`))
            .join(" AND ");
        const sql = `SELECT 1 FROM ${this.table} WHERE ${whereClause} LIMIT 1`;

        try {
            const res = await db().query(sql, values);
            return res.rows.length > 0;
        } catch (err) {
            console.error(`[DB] Exists check failed:\n`, err);
            return false;
        }
    }
}

export class User extends Model {
    public id!: string;
    public player_id?: string | null;
    public username!: string;
    public player_username!: string;
    public bot_perm!: number | string;
    public last_updated_skills?: Date | null;

    public static async ensureUserExists(
        userId: string,
        username: string,
        botPerm: number | bigint = 0,
    ) {
        try {
            await db().query(
                `
                INSERT INTO Users(id, username, bot_perm)
                VALUES (?, ?, ?)
                ON CONFLICT(id) DO NOTHING;
            `,
                [userId, username, botPerm],
            );
        } catch (err) {
            console.error(err);
        }
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

    public static async getParam(
        guildId: string,
        commandName: string,
        paramName: string,
        settlementId?: number | bigint | string | null,
    ): Promise<ChannelParam | null> {
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
        const resQ = await ChannelParam.get({
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

    public override async insert(): Promise<this | undefined> {
        const res = await super.insert();
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

    public override async update(): Promise<boolean> {
        const res = await super.update();
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

    public override async delete(): Promise<boolean> {
        const res = await super.delete();
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
    public skill_id!: number;

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

    public override async sync(): Promise<boolean> {
        const res = await super.sync();
        if (res && this.settlement_id) {
            this._settlement = await Settlement.get({
                keys: "id",
                values: this.settlement_id,
            });
        }
        return res;
    }

    public override async update(): Promise<boolean> {
        const res = await super.update();
        if (res && this.settlement_id) {
            this._settlement = await Settlement.get({
                keys: "id",
                values: this.settlement_id,
            });
        }
        return res;
    }

    public override async insert(): Promise<this | undefined> {
        const res = await super.insert();
        if (res && this.settlement_id) {
            this._settlement = await Settlement.get({
                keys: "id",
                values: this.settlement_id,
            });
        }
        return res;
    }

    private _settlement?: Settlement | null;

    // Don't forget to sync before using this, or settlement won't be set
    public toString(discord?: boolean): string {
        const setl = this._settlement ?? null;
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

    public override async insert(): Promise<this | undefined> {
        const res = await super.insert();
        if (res) sendCommands(this.guild_id).catch(console.log);
        return res;
    }

    public override async update(): Promise<boolean> {
        const res = await super.update();
        if (res) sendCommands(this.guild_id).catch(console.log);
        return res;
    }

    public override async delete(): Promise<boolean> {
        const res = await super.delete();
        if (res) sendCommands(this.guild_id).catch(console.log);
        return res;
    }
}

export class SettlementMember extends Model {
    public settlement_id!: number | bigint | string | null;
    public user_id!: string;
    public perm_level!: number;
}

export class LastUpdated extends Model {
    public table_name!: string;
    public last_updated!: Date;

    override fieldTypes: Record<string, FieldType> = {
        last_updated: "Date",
    };
}

export class Empire extends Model {
    public entityId!: string;
    public e_name!: string;
    public memberCount!: string;
    public leader!: string;
}

export class WatchtowerStatus extends Model {
    public guild_id!: string;
    public channel_id!: string;
    public message_id!: string;
    public empire_id!: string;
}

export class SharedCraftsStatus extends Model {
    public id!: number;
    public guild_id!: string;
    public channel_id!: string;
    public claim_id!: string;
}

export class SharedCraft extends Model {
    public id!: number;
    public message_id!: string;
    public entityId!: string;
    public status_id!: number;
    public item_name!: string;
    public crafting_station!: string;
    public status!: string;
    public claim_name!: string;
    public progress!: number;
    public total!: number;
    public owner_name!: string;
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
    for (const [n, k, d, e, s] of [
        [
            "Forestry",
            SkillKind.Gather,
            "Bûcheron",
            "<:skill_forestry:1400969700925771787>",
            2,
        ],
        [
            "Carpentry",
            SkillKind.Refine,
            "Charpentier",
            "<:skill_carpentry:1400969531857309726>",
            3,
        ],
        [
            "Masonry",
            SkillKind.Refine,
            "Maçon",
            "<:skill_masonry:1400969755904442569>",
            4,
        ],
        [
            "Mining",
            SkillKind.Gather,
            "Mineur",
            "<:skill_mining:1400969776494542888>",
            5,
        ],
        [
            "Smithing",
            SkillKind.Refine,
            "Forgeron",
            "<:skill_smithing:1400969823516753920>",
            6,
        ],
        [
            "Scholar",
            SkillKind.Refine,
            "Savant",
            "<:skill_scholar:1400969804977799168>",
            7,
        ],
        [
            "Leatherworking",
            SkillKind.Refine,
            "Tanneur",
            "<:skill_leatherworking:1400969735029526608>",
            8,
        ],
        [
            "Hunting",
            SkillKind.Gather,
            "Chasseur",
            "<:skill_hunting:1400969717371375796>",
            9,
        ],
        [
            "Tailoring",
            SkillKind.Refine,
            "Tisserand",
            "<:skill_tailoring:1400969842479071354>",
            10,
        ],
        [
            "Farming",
            SkillKind.Refine,
            "Fermier",
            "<:skill_farming:1400969632772259890>",
            11,
        ],
        [
            "Fishing",
            SkillKind.Gather,
            "Pêcheur",
            "<:skill_fishing:1400969663763972157>",
            12,
        ],
        [
            "Cooking",
            SkillKind.Skill,
            "Cuistot",
            "<:skill_cooking:1400969611943350272>",
            13,
        ],
        [
            "Foraging",
            SkillKind.Gather,
            "Ceuilleur",
            "<:skill_foraging:1400969681640226967>",
            14,
        ],
        ["Construction", SkillKind.Skill, "Construction", "🛠️", 15],
        ["Taming", SkillKind.Skill, "Eleveur", "🐑", 17],
        ["Slayer", SkillKind.Skill, "Massacreur", "☠️", 18],
        ["Merchanting", SkillKind.Skill, "Marchand", "💰", 19],
        ["Sailing", SkillKind.Skill, "Navigateur", "⛵", 21],
    ]) {
        db().query(
            `
            INSERT INTO Professions(p_name, kind, description, emoji, skill_id)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(p_name) DO NOTHING;
            `,
            [n, k, d, e, s],
        );
        db().query(
            `UPDATE Professions 
            SET kind = ?, description = ?, emoji = ?, skill_id = ?
            WHERE p_name = ?;`,
            [k, d, e, s, n],
        );
    }
}

//changeProfs();

//console.log(Profession.fetchArray());
