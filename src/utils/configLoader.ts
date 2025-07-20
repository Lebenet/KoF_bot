import fs from "fs";
import path from "path";
import { exit } from "process";
import Database from "better-sqlite3";

/*
// Files to read
const dataPaths = {
    admins: '../data/admins.json',
    providers: '../data/providers.json',
    towns: '../data/towns.json'
}
*/

// Dynamix config holder
const config: any = {
    locked: false, // Bot lock during hot-reload (or other)
};

export const lockBot = () => (config.locked = true);
export const unlockBot = () => (config.locked = false);

/*
// Not reset during config reload
const exceptions = Array.of('locked');

function addException(exception) {
    exceptions.push(exception)
}

// Reset config keys
function resetConfig() {
    for (const key in config) {
        if (exceptions.includes(key))
            continue;

        delete config[key];
    }
}
*/

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
        console.log(
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

export const getConfig = () => config;

export const setDb = (db: Database.Database) => (config.db = db);
