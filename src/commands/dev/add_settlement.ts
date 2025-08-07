import {
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    User,
} from "discord.js";
import { primaryEmbed } from "../../utils/discordUtils";
import { Config, Settlement, User as DbUser } from "../../db/dbTypes";

async function addSettlement(
    interaction: ChatInputCommandInteraction,
    config: Config,
) {
    if (!config.admins?.includes(interaction.user.id)) {
        interaction.reply({
            content:
                "Vous n'avez pas le droit de faire cette commande! Seul un admin peut.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Get params
    const name: string = interaction.options.getString("name", true);
    const owner: User =
        interaction.options.getUser("owner") ?? interaction.user;

    // Check for duplicate
    if (
        Settlement.get({
            keys: ["guild_id", "s_name"],
            values: [interaction.guildId!, name],
        })
    ) {
        interaction.reply({
            content: "Un settlement de ce nom existe déjà dans ce serveur !",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    DbUser.ensureUserExists(owner.id, owner.displayName);

    // Initialise object
    const setl = new Settlement();
    setl.s_name = name;
    setl.guild_id = interaction.guildId!;
    setl.owner_id = owner.id;

    // Try to insert
    if (!setl.insert()) {
        interaction.reply({
            content: "Erreur de DB, le claim n'a pas pu être ajouté à la DB!",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    interaction.reply({
        content: `**Réussi**. Claim __${name}__ ajouté, avec comme owner **<@${owner.id}>**.`,
        flags: MessageFlags.Ephemeral,
    });
    setTimeout(() => interaction.deleteReply(), 5_000);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("add_settlement")
        .setDescription("Créer un settlement (claim) dans la db.")
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("Nom du claim.")
                .setRequired(true),
        )
        .addUserOption((option) =>
            option
                .setName("owner")
                .setDescription("Owner du claim (optionel, défaut sur vous)")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: addSettlement,
    help: primaryEmbed({
        title: "add_settlement | Aide",
        description:
            `
			Cette commande sert à **ajouter un claim** dans la **DB**.
			Il y a **2** __paramètres__:` +
            "- `name`: Nom du claim, paramètre obligatoire." +
            "- `owner`: Owner du claim, *optionnel*. Si non fourni, **vous** serez mis comme owner du claim." +
            `\n-# *Si vous souhaitez que votre claim ait son propre \`/commander\`, merci de contacter \`@lebenet\` ou un admin en privé.*`,
    }),
};
