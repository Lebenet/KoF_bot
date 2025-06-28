const chokidar = require('chokidar');
const fs = require('node:fs');
const path = require('node:path');

const { initLoad, unloadCommand, loadCommand, sendCommands, getCommands } = require('./commandLoader.js');
const { loadConfig, addSingleConfig, /* updateSingleConfig, deleteSingleConfig, */ getConfig, lockBot, unlockBot } = require('./configLoader.js');

async function configWatcher() {}

async function commandWatcher() {}

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
	sendCommands();

	// TODO: Watcher
}

module.exports = {
	start,
};