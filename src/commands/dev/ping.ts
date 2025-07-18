import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

async function ping(interaction: ChatInputCommandInteraction, _config: any) {
    await interaction.reply("Pong! dev");
}

module.exports = {
    data: new SlashCommandBuilder().setName("ping").setDescription("pong"),

    execute: ping,
};
