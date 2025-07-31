import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { primaryEmbed } from "../../utils/discordUtils";

async function ping(interaction: ChatInputCommandInteraction, _config: any) {
    await interaction.reply("Pong! dev");
}

module.exports = {
    data: new SlashCommandBuilder().setName("ping").setDescription("pong"),

    execute: ping,
    help: () =>
        primaryEmbed({
            title: "Ping - Aide",
            description:
                "La commande ping ne sert à rien, c'est juste un placeholder pour plus tard.",
        }),
};
