const { SlashCommandBuilder } = require('discord.js');

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

/*
Command to publish a test command to prod
Requires bot admin
*/

async function publish(interaction, config) {
	try {
		console.log(`admins:  ${config.admins}`);
		console.log(`user_id: ${interaction.user.id}`);
		// Check user has sufficient permissions
		if (!config.admins.includes(interaction.member.user.id)){
			await interaction.reply(`Only bot admins can use this command.`);
			return;
		}

		// Get the file from the command arg
		const cmd = interaction.options.getString('command');
		const file = path.resolve(`commands/dev/${cmd}.js`);
		
		// Check if the file exists
		try {
			await fsp.access(file, fs.constants.F_OK);
		} catch (err) {
			console.error(`[ERROR] | Publish: File ${file} does not exist: \n`, err);
			await interaction.followUp(`Command **\`/${cmd}\`** does not exist.`);
			return;
		}

		// Copy to /commands/
		const dst = path.resolve(`./commands/public/${cmd}.js`);
		fs.copyFile(file, dst, async (err) => {
			if (err){
				console.error(`[ERROR] | Publish: An error occured while publishing ${cmd} command:\n`, err);
				await interaction.reply(`Error while publishing **\`/${cmd}\`** command.`);
			} else {
				console.log(`[COMMANDS] | Publish: Succesfully published the ${cmd} command.`);
				await interaction.reply(`Succesfully published the **\`/${cmd}\`** command.`);
			}
		});

	} catch (err) {
		console.error('[ERROR] | Publish: Something went wrong:\n', err);
		await interaction.reply('Something went wrong.');
	}
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('publish')
		.setDescription('Makes a dev-only command public')
		.addStringOption(option =>
			option
				.setName('command')
				.setDescription('Name of the command you wish to publish')
				.setRequired(true)
		),

	execute: publish
};