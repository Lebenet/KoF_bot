import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    Colors,
    MessageFlags,
} from "discord.js";
import {
    getCommandsHelper,
    getTasksHelper,
    personalEmbed,
} from "../../utils/discordUtils";
import { getGuildCommands } from "../../utils/commandLoader";
import { getConfig } from "../../utils/configLoader";
import { Config } from "../../db/dbTypes";

const dirName = (): string => __dirname.replace(/.*\/(dev|public)$/, "$1");

async function help(interaction: ChatInputCommandInteraction, _config: Config) {
    console.log(
        getCommandsHelper(
            (dirName() === "dev"
                ? process.env.DEV_GUILD_ID
                : process.env.GUILD_ID) ?? "0",
        )
            .toReversed()
            .map(
                (n) =>
                    `- **${n.name}**${(n.args?.length ?? 0 > 0) ? ` *(${n.args!.join(", ")})*` : ""}`,
            )
            .join("\n"),
    );
    console.log(
        getCommandsHelper(
            (dirName() === "dev"
                ? process.env.DEV_GUILD_ID
                : process.env.GUILD_ID) ?? "0",
        )
            .toReversed()
            .map(
                (n) =>
                    `- **${n.name}**${(n.args?.length ?? 0 > 0) ? ` *(${n.args!.join(", ")})*` : ""}`,
            )
            .join("\n").length,
    );

    console.log(
        getTasksHelper(
            (dirName() === "dev"
                ? process.env.DEV_GUILD_ID
                : process.env.GUILD_ID) ?? "0",
        )
            .map((n) => `- **${n.name}**`)
            .join("\n"),
    );
    console.log(
        getTasksHelper(
            (dirName() === "dev"
                ? process.env.DEV_GUILD_ID
                : process.env.GUILD_ID) ?? "0",
        )
            .map((n) => `- **${n.name}**`)
            .join("\n").length,
    );

    const commandName = interaction.options.getString("commande");
    if (!commandName) {
        const embed: EmbedBuilder = module.exports.help;
        embed.setFields([
            {
                name: "__Commandes__:",
                value: getCommandsHelper(
                    (dirName() === "dev"
                        ? process.env.DEV_GUILD_ID
                        : process.env.GUILD_ID) ?? "0",
                )
                    .toReversed()
                    .map(
                        (n) =>
                            `- **${n.name}**${(n.args?.length ?? 0 > 0) ? ` *(${n.args!.join(", ")})*` : ""}`,
                    )
                    .join("\n"),
            },
            {
                name: "__Tâches automatiques__:",
                value: getTasksHelper(
                    (dirName() === "dev"
                        ? process.env.DEV_GUILD_ID
                        : process.env.GUILD_ID) ?? "0",
                )
                    .map((n) => `- **${n.name}**`)
                    .join("\n"),
            },
        ]);
        interaction.user.send({
            embeds: [embed],
        });
        interaction.reply({
            content: "Réponse envoyée en DM !",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const command = getGuildCommands(interaction.guildId!).get(commandName);
    if (command.help) interaction.reply({ embeds: [command.help] });
    else interaction.reply("Cette commande n'a pas de message d'aide défini !");
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("help")
        .setDescription("Une commande pour afficher un message d'aide.")
        .addStringOption((option) =>
            option
                .setName("commande")
                .setDescription("Nom de la commande (optionel)")
                .setRequired(false)
                .addChoices(
                    getCommandsHelper(
                        (dirName() === "dev"
                            ? process.env.DEV_GUILD_ID
                            : process.env.GUILD_ID) ?? "0",
                    ),
                ),
        ),

    execute: help,
    help: personalEmbed(
        {
            title: "Liste des commandes et tâches du serveur:",
            description:
                "*Si vous souhaitez afficher l'aide d'un commande en particulier, faites `/help <commande>`.\n \
			L'aide pour les tâches automatiques n'est pas encore supporté.*",
            fields: [
                {
                    name: "Error",
                    value: "Something went wrong, please ask an admin to reload this command.",
                },
            ],
            thumbnail: getConfig().bot.user.avatarURL(),
        },
        Colors.Yellow,
    ),
};
