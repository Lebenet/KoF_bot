const { SlashCommandBuilder } = require('discord.js');

async function ping(interaction, _config) {
	await interaction.reply('Pong! dev');
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('pong'),

	execute: ping
};