// Imports
const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');
const { PassThrough } = require('node:stream');

// Dynamically loaded commands
const commands = new Map();

function unloadCommand(file, filePath) {
	// Delete command from require memory
	try {
		delete require.cache(require.resolve(filePath));
	} catch {
		PassThrough; // just means didn't need reloading
	}

	// Delete command from map
	commands.delete(file.replace('.js', ''));
}

function loadCommand(file) {
	const filePath = path.resolve(path.join('commands', file));
	console.log(filePath);
	unloadCommand(file, filePath);

	const name = file.replace('.js', ''); // Command name instead of plain filename

	try {
		// Load command to require memory
		const command = require(filePath);

		if ('data' in command && 'execute' in command) {
			// Load command to map
			commands.set(command.data.name, command);
		} else {
			console.warn(`[HOT-RELOAD] | [WARN] Command ${name} missing "data" or "execute" fields.`);
		}
	} catch (err) {
		console.error(`[HOT-RELOAD] | [ERROR] Failed to load command ${name}:\n`, err);
		// TODO: implement reloading old behaviour
	}
}
function initLoad() {
	const commandFiles = fs.readdirSync('./commands/')
		.filter(file => file.endsWith('.js'));

	commandFiles.forEach(file => loadCommand(file));
}

const getCommands = () => commands;
const getCommandsArray = () => [...commands.values()].map(cmd => cmd.data.toJSON());

// Set REST API
const rest = new REST().setToken(process.env.BOT_TOKEN);

// Sends slash commands to discord
async function sendCommands() {
	try {
		console.log('Started refreshing application (/) commands.');

		await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
			{ body: getCommandsArray() });

		console.log('Successfully reloaded application (/) commands.');
	} catch (err) {
		console.error(err);
	}
}

module.exports = {
	initLoad,
	unloadCommand,
	loadCommand,
	getCommands,
	getCommandsArray,
	sendCommands,
};