import {
    ActionRowBuilder,
    APIEmbedField,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    MessageActionRowComponentBuilder,
    MessageFlags,
    SlashCommandBuilder,
    TextChannel,
} from "discord.js";
import {
    primaryEmbed,
    warningEmbed,
    updateSkills,
    getEmoji,
    getKind,
} from "../../utils/discordUtils";
import {
    Config,
    User,
    Fournisseur,
    Skill,
    Profession,
    SkillKind,
} from "../../db/dbTypes";

async function getProfileEmbed(
    userId: string,
    guildId: string,
    config: Config,
) {
    const user = new User();
    user.id = userId;
    if (!user.sync())
        return warningEmbed({
            title: "Erreur",
            description: "DB error",
        });

    const dUser = await config.bot.users.fetch(userId)!;
    return primaryEmbed({
        title: `Profil de ${dUser.displayName} (${user.player_username} in-game)`,
        description:
            "*Cette page n'a pour l'instant pas beaucoup d'utilité.\nN'hésitez pas à en suggérer !\n-# **`lebenet`** en dm*",
        author: { name: dUser.displayName, iconURL: dUser.displayAvatarURL() },
        timestamp: true,
        fields: [
            {
                name: "Rôles:",
                value:
                    Fournisseur.fetchArray({
                        keys: ["user_id", "guild_id"],
                        values: [userId, guildId],
                    })
                        .map((f) => {
                            return `- **${f.coordinator ? "🔧 Coordinateur" : "Fournisseur"}** de __${f.profession_name}__`;
                        })
                        .join("\n") || "Aucun rôle de métier.",
            },
        ],
    });
}

async function getSkillsEmbed(userId: string, config: Config) {
    const user = new User();
    user.id = userId;
    if (!user.sync())
        return warningEmbed({
            title: "Erreur",
            description: "DB error",
        });

    if (!user.player_id)
        return warningEmbed({
            title: "Pas link !",
            description: "Cet utilisateur ne s'est pas encore `/link`.",
        });

    const dUser = await config.bot.users.fetch(userId)!;

    const skills = Skill.fetchArray({
        keys: "user_id",
        values: userId,
    }).toSorted((s1, s2) => (s1.profession_name < s2.profession_name ? -1 : 1));
    const pskills = skills.filter((s) =>
        [SkillKind.Profession, SkillKind.Gather, SkillKind.Refine].includes(
            getKind(s.profession_name),
        ),
    );
    const sskills = skills.filter(
        (s) => getKind(s.profession_name) === SkillKind.Skill,
    );

    return primaryEmbed({
        author: { name: dUser.displayName, iconURL: dUser.displayAvatarURL() },
        title: `Tableau des __métiers__`,
        description: `*Utilisateur Discord: <@${user.id}>*`,
        fields: [
            { name: "\u200e", value: "**__Professions__**", inline: false },
            ...pskills.map((s) => s.format()),
            { name: "\u200e", value: "**__Skills__**", inline: false },
            ...sskills.map((s) => s.format()),
        ],
        footer: { text: "Dernière update:" },
        timestamp: user.last_updated_skills,
    });
}

// dsk: displaySkills
function getComponents(dsk: boolean, target: string, author: string) {
    // gotoSkills button
    const gotoSkillsBut = new ButtonBuilder()
        .setCustomId(`|profil|gotoSkillsHandler|${target}|${author}`)
        .setLabel("Skills")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⏩")
        .setDisabled(dsk);

    // gotoProfile button
    const gotoProfileBut = new ButtonBuilder()
        .setCustomId(`|profil|gotoProfileHandler|${target}|${author}`)
        .setLabel("Profil")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("⏪")
        .setDisabled(!dsk);

    // updateSkills button
    const updateSkillsBut = new ButtonBuilder()
        .setCustomId(`|profil|updateSkillsHandler|${target}|${author}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji("🔃")
        .setDisabled(!dsk);

    return [
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            gotoProfileBut,
            gotoSkillsBut,
            updateSkillsBut,
        ),
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`|profil|delHandler|${target}|${author}`)
                .setLabel("\u200e")
                .setStyle(ButtonStyle.Danger)
                .setEmoji("🚮"),
        ),
    ];
}

async function profil(
    interaction: ChatInputCommandInteraction,
    config: Config,
) {
    const displaySkills = interaction.options.getBoolean("skills") ?? false;
    const user = interaction.options.getUser("joueur") ?? interaction.user;
    User.ensureUserExists(user.id, user.displayName);

    const embeds = [
        displaySkills
            ? await getSkillsEmbed(user.id, config)
            : await getProfileEmbed(user.id, interaction.guildId!, config),
    ];
    const components = await getComponents(
        displaySkills,
        user.id,
        interaction.user.id,
    );

    interaction.reply({
        embeds: embeds,
        components: components,
        flags: MessageFlags.Ephemeral,
    });
}

async function gotoProfileHandler(
    interaction: ButtonInteraction,
    config: Config,
) {
    const [, , , targetId, authorId] = interaction.customId.split("|");

    const embeds = [
        await getProfileEmbed(targetId, interaction.guildId!, config),
    ];
    const components = getComponents(false, targetId, authorId);

    interaction.update({
        embeds: embeds,
        components: components,
    });
}

async function gotoSkillsHandler(
    interaction: ButtonInteraction,
    config: Config,
) {
    const [, , , targetId, authorId] = interaction.customId.split("|");

    const embeds = [await getSkillsEmbed(targetId, config)];
    const components = getComponents(true, targetId, authorId);

    interaction.update({
        embeds: embeds,
        components: components,
    });
}

async function updateSkillsHandler(
    interaction: ButtonInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const [, , , targetId, authorId] = interaction.customId.split("|");
    const msg = interaction.message;

    const res = await updateSkills(targetId);

    interaction.editReply(
        res.success
            ? (res.message ?? "Update réussie.")
            : (res.error ?? "Quelque chose s'est mal passé."),
    );
    setTimeout(() => interaction.deleteReply(), 3_000);

    const embeds = [await getSkillsEmbed(targetId, config)];
    const components = getComponents(true, targetId, authorId);

    msg.edit({
        embeds: embeds,
        components: components,
    });
}

async function delHandler(interaction: ButtonInteraction, _config: Config) {
    /*
    const [, , , targetId, authorId] = interaction.customId.split("|");
    if (![targetId, authorId].includes(interaction.user.id)) {
        interaction.reply({
            content: "Pas le tiens !",
            flags: MessageFlags.Ephemeral,
        });
        setTimeout(() => interaction.deleteReply(), 3_000);
        return;
    }
	*/

    interaction.message.delete();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("profil")
        .setDescription("Commande pour afficher votre profil BitCraft.")
        .addBooleanOption((option) =>
            option
                .setName("skills")
                .setDescription("Aller directement sur la page des skills ?")
                .setRequired(false),
        )
        .addUserOption((option) =>
            option
                .setName("joueur")
                .setDescription(
                    "Personne dont vous souhaitez regarder le profil",
                )
                .setRequired(false),
        ),

    execute: profil,

    gotoProfileHandler: gotoProfileHandler,
    gotoSkillsHandler: gotoSkillsHandler,
    updateSkillsHandler: updateSkillsHandler,
    delHandler: delHandler,

    help: () =>
        primaryEmbed({
            title: "profil | aide",
            description:
                "Commande pour afficher votre profil BitCraft.\n\
		*Si ce n'est pas déjà fait, merci de faire `/link` d'abord. `/help link` pour plus d'infos.*\n\
		Cette commande a 2 paramètres:\n\
		 - **skills**\n" +
                "   - Un booleen pour choisir entre la page du profil normal et celle des skills.\n" +
                "   - Optionel\n" +
                " - **player**\n" +
                "   - Un menu pour sélectionner celui dont vous voulez voir le profil\n" +
                "   - Optionel\n" +
                "   - Utilisable avec skills, par défaut sur vous. Marche uniquement si il a fait `/link` aussi.",
        }),
};
