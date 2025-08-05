import fs from "fs";
import path from "path";
import { exit } from "process";
import Database from "better-sqlite3";
import { Client } from "discord.js";
import { Config } from "../db/dbTypes";
import { __get_config } from "./states";

export const reloadDummyConfigLoader = "...";

// Dynamic config holder
const config: Partial<Config> | Config = __get_config();

export const lockBot = () => (config.locked = true);
export const unlockBot = () => (config.locked = false);

function resolveFromFileName(fileName: string) {
    const filePath = path.resolve(`./data/${fileName}`);
    const key = fileName.replace(".json", "");

    return { key, filePath };
}

export function addSingleConfig(fileName: string) {
    try {
        const { key, filePath } = resolveFromFileName(fileName);
        const raw = fs.readFileSync(filePath, "utf-8");

        // parse content
        config[key] = JSON.parse(raw);
    } catch (err: any) {
        throw new Error(
            `[HOT-RELOAD] Failed to load new config ${fileName}: ${err.message}`,
        );
        // FIXME: implement reloading old data
    }
}

export function deleteSingleConfig(fileName: string) {
    try {
        // Delete entry from config
        const key = fileName.replace(".json", "");
        delete config[key];
    } catch (err) {
        console.error(
            `[ERROR] | [CONFIG] Failed to remove config file from config:\n`,
            err,
        );
    }
}

export function loadConfig(
    dataEntries: Array<string> /* list of filenames based on './data/*' */,
) {
    dataEntries.forEach((fileName: string) => {
        try {
            addSingleConfig(fileName);
        } catch (err: any) {
            console.error(
                `[CONFIG] Failed to load ${fileName} config file on init: ${err.message}`,
            );
            exit;
        }
    });
}

export const getConfig = (): Config => config as Config;

export const setDb = (db: Database.Database) => (config.db = db);

export const setBot = (bot: Client) => (config.bot = bot);
