import Database from "better-sqlite3";

export const db = new Database("./database.db", {
    nativeBinding:
        "../../node_modules/better-sqlite3/build/Release/better_sqlite3.node",
});
db.pragma("journal_mode = WAL");

let _ready = false;
export const ready = () => ready;

const tables = [""];

function init() {
    // Make sure every table exists correctly
    for (const table of tables) {
        db.exec(table);
    }

    // Mark the DB connexion as ready
    _ready = true;
}
