const fs = require('node:fs');
const path = require('node:path');
const { exit } = require('node:process');

/*
// Files to read
const dataPaths = {
    admins: '../data/admins.json',
    providers: '../data/providers.json',
    towns: '../data/towns.json'
}
*/

// Dynamix config holder
const config = {
	locked: false, // Bot lock during hot-reload (or other)
};

const lockBot = () => config.locked = true;
const unlockBot = () => config.locked = false;

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

function resolveFromFileName(fileName) {
	const filePath = path.resolve(`./data/${fileName}`);
	const key = fileName.replace('.json', '');

	return { key, filePath };
}

function addSingleConfig(fileName) {
	 try {
		const { key, filePath } = resolveFromFileName(fileName);
 		const raw = fs.readFileSync(filePath);

   	     // parse content
		config[key] = JSON.parse(raw);
	} catch (err) {
		throw new Error(`[HOT-RELOAD] Failed to load new config ${fileName}: ${err.message}`);
		// FIXME: implement reloading old data
	}
}

function deleteSingleConfig(fileName) {
	try {
		// Delete entry from config
		const key = fileName.replace('.json', '');
		delete config[key];
	} catch (err) {
		console.log(`[ERROR] | [CONFIG] Failed to remove config file from config:\n`, err);
	}
}

function loadConfig(dataEntries /* list of filenames based on './data/*' */) {
	dataEntries.forEach(fileName => {
		try {
			addSingleConfig(fileName);
		} catch (err) {
			console.error(`[CONFIG] Failed to load ${fileName} config file on init: ${err.message}`);
			exit;
		}
	});
}

const getConfig = () => config;

module.exports = {
	loadConfig,
	addSingleConfig,
	//updateSingleConfig,
	deleteSingleConfig,
	getConfig,
	lockBot,
	unlockBot,
	//addException
};