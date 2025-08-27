import {
    ChatInputCommandInteraction,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";
import { primaryEmbed } from "../../utils/discordUtils";
import { Config } from "../../utils/configLoader";
import { User } from "../../db/dbTypes";

module.exports = {
    data: new SlashCommandBuilder()
        .setName("unlink")
        .setDescription(
            "Retirer le lien entre votre profil discord et BitCraft",
        ),

    execute: async (
        interaction: ChatInputCommandInteraction,
        config: Config,
    ) => {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        User.ensureUserExists(
            interaction.user.id,
            interaction.user.displayName,
            0,
        );
        const user: User = User.get({
            keys: "id",
            values: interaction.user.id,
        }) as User;
        if (user.player_id === null) {
            await interaction.editReply("Vous n'êtes pas link !");
            return;
        }

        user.player_id = null;
        user.player_username = "empty_game_username";
        if (!user.update()) {
            await interaction.reply("Erreur de DB, pas réussi à vous unlink !");
            return;
        }

        config.db.prepare("DELETE FROM Skills WHERE user_id = ?;").run(user.id);
        interaction.editReply("Réussi.").catch();
        setTimeout(() => interaction.deleteReply().catch(), 5_000);
    },

    help: primaryEmbed({
        title: "Unlink | Aide",
        description:
            "Retire le lien qu'il existe entre votre profil discord et BitCraft",
        author: null,
        footer: null,
        timestamp: true,
    }),
};
