const chokidar = require('chokidar');
const fs = require('node:fs');
const path = require('node:path');

const { initLoad, unloadCommand, loadCommand, sendCommands, getCommands, getGuildCommands } = require('./commandLoader.js');
const { loadConfig, addSingleConfig, /* updateSingleConfig, deleteSingleConfig, */ getConfig, lockBot, unlockBot } = require('./configLoader.js');

const folders = {
	'commands\\dev\\': './commands/dev/',
	'commands\\public\\': './commands/public/',
};

async function configWatcher() {}

async function commandWatcher() {}

function getFileDir(filePath) {
	const file = filePath.split('\\')[2];
	const dir = filePath.replace(file, '');
	return { file, dir };
}

function start() {
	// Load config
	loadConfig(fs.readdirSync('./data/'));
	const config = getConfig();
	console.log('config:\n', config);

	// Load commands
	initLoad();
	const commands = getCommands();
	console.log('commands:\n', commands);

	// Register slash commands to discord
	sendCommands(process.env.DEV_GUILD_ID);
	// sendCommands(process.env.GUILD_ID);

	// TODO: Watcher
	const watcher = chokidar.watch(['./commands/public/', './commands/dev/'], {
		persistent: true,																// runs as long as the bot is up
		ignoreInitial: true,															// ignore initial files
		ignored: (filePath, stats) => stats?.isFile() && !filePath.endsWith('.js'),		// only watch .js files
	});

	watcher
		.on('add', filePath => {
			// Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
			config.locked = true;

			const { file, dir } = getFileDir(filePath);
			if (!file || !dir) {
				console.error(`[ERROR] | Watcher add: failed to extract filename and dir from filePath: ${filePath}`);
				return;
			}

			const guild_id = dir == 'commands\\public\\' ? process.env.GUILD_ID : process.env.DEV_GUILD_ID;
			loadCommand(file, folders[dir]);
			sendCommands(guild_id);
			console.log(getCommands());

			console.log(`[WATCHER] | Added: ${filePath}`);

			// Unlock bot once hot-reload is complete
			config.locked = false;
		})
		.on('change', filePath => {
			// Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
			config.locked = true;

			const { file, dir } = getFileDir(filePath);
			if (!file || !dir) {
				console.error(`[ERROR] | Watcher change: failed to extract filename and dir from filePath: ${filePath}`);
				return;
			}

			const guild_id = dir == 'commands\\public\\' ? process.env.GUILD_ID : process.env.DEV_GUILD_ID;
			loadCommand(file, folders[dir]);
			sendCommands(guild_id);
			console.log(getCommands());

			console.log(`[WATCHER] | Changed: ${filePath}`);

			// Unlock bot once hot-reload is complete
			config.locked = false;
		})
		.on('unlink', filePath => {
			// Lock bot to avoid errors during hot-reload (later only lock certain commands, and only per-server)
			config.locked = true;

			const { file, dir } = getFileDir(filePath);
			if (!file || !dir) {
				console.error(`[ERROR] | Watcher unlink: failed to extract filename and dir from filePath: ${filePath}`);
				return;
			}

			const guild_id = dir == 'commands\\public\\' ? process.env.GUILD_ID : process.env.DEV_GUILD_ID;
			unloadCommand(file, filePath, getGuildCommands(guild_id));
			sendCommands(guild_id);
			console.log(getCommands());

			console.log(`[WATCHER] | Unlinked: ${filePath}`);

			// Unlock bot once hot-reload is complete
			config.locked = false;
		});
}

module.exports = {
	start,
};