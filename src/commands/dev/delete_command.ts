import {
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import { Config, Command } from "../../db/dbTypes";
import { warningEmbed } from "../../utils/discordUtils";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("delete_command")
        .setDescription("Delete a command from the DB by its id")
        .addStringOption((option) =>
            option
                .setName("id")
                .setDescription("id de la commande")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: async (
        interaction: ChatInputCommandInteraction,
        config: Config,
    ) => {
        if (!config.admins?.includes(interaction.user.id)) {
            interaction.reply({
                content: "Not a bot admin",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const command = new Command();
        command.id = interaction.options.getString("id")!;
        if (!command.delete()) {
            interaction.editReply("Failed");
            return;
        }

        interaction.editReply("Success");
    },

    help: () =>
        warningEmbed({
            title: "delete_command | Aide",
            description:
                "Une commande (du bot) pour supprimer une commande (de matériaux).\n\
		S'utilise avec l'ID de la commande (de matériaux).",
        }),
};
