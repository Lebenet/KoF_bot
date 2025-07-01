const { SlashCommandBuilder } = require('discord.js');

async function ping(interaction, _config) {
	
}

module.exports = {
	data: new SlashCommandBuilder()
		.setName('ping')
		.setDescription('pong'),

	async execute(interaction, config) {
		await interaction.reply('Pong!');
	}
};