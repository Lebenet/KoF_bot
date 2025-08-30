import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    User as DiscordUser,
    EmbedBuilder,
    Client,
    MessageFlags,
    GuildMember,
} from "discord.js";
import { User, Fournisseur, Settlement } from "../../db/dbTypes";
import { Config } from "../../utils/configLoader";
import {
    getProfessionsStringSelectCommandArg,
    getSettlementsHelper,
    primaryEmbed,
} from "../../utils/discordUtils";

async function manageProvider(
    interaction: ChatInputCommandInteraction,
    config: Config,
) {
    // Targeted profession
    const prof: string | null = interaction.options.getString("profession");

    // Get referenced member
    const user: DiscordUser | null = interaction.options.getUser("membre");
    let member: GuildMember;

    // Guild ID
    const guildId: string = (interaction.guild?.id ??
        interaction.guildId) as string;

    // Target settlement (if provided)
    const claimId = interaction.options.getString("claim");
    let setl: Settlement | null = null;
    if (claimId) setl = await Settlement.get({ keys: "id", values: claimId });
    if (!setl && claimId) {
        await interaction.reply({
            content: "Claim pas trouvé !",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // If only trying to get information, not changing stuff
    // FIXME: WIP
    if (!user || !prof) {
        const bot: Client = config.bot;
        if (!bot.user) {
            await interaction.reply({
                content: "Quelque chose est cassé? Le bot ne se voit même pas!",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // DB calls (defer reply)
        await interaction.deferReply();

        // Build base embed
        const embed = new EmbedBuilder()
            .setAuthor({ name: bot.user.displayName })
            .setTitle(
                `__Fournisseurs__${prof ? ` du métier **${prof}**` : ""}.`,
            )
            .setDescription(
                "Liste des __fournisseurs__. Les __coordinateurs__ sont marqués d'un **🔧**.",
            )
            .setThumbnail(bot.user.avatarURL())
            .setFooter({
                text: "WIP",
                iconURL: bot.user.avatarURL() ?? undefined,
            })
            .setColor("Blurple")
            .setTimestamp(Date.now());

        if (prof) {
            // Get all providers of given profession
            const keys = ["profession_name", "guild_id"];
            const values: (number | string | bigint)[] = [prof, guildId];
            if (setl) {
                keys.push("settlement_id");
                values.push(setl.id);
            }
            const provs = (
                await Fournisseur.fetchArray({
                    keys: keys,
                    values: values,
                })
            ).toSorted((p1: Fournisseur, p2: Fournisseur): number =>
                p1.coordinator < p2.coordinator ? 1 : -1,
            );

            if (provs.length === 0) {
                await interaction.editReply(
                    `Pas de __fournisseur__ n'a été trouvé pour la profession **${prof}**.`,
                );
                return;
            }

            // Construct embed
            embed.addFields([
                {
                    name: "**🔧** Coordinateurs",
                    value: provs
                        .filter((p) => p.coordinator)
                        .map((p) => {
                            const user: DiscordUser | undefined =
                                bot.users.cache.get(p.user_id);
                            if (!user) return "-# error";
                            return `**<@${user.id}>**    ||(${user.displayName})||`;
                        })
                        .join("\n"),
                },
                {
                    name: "Fournisseurs",
                    value: provs
                        .filter((p) => !p.coordinator)
                        .map((p) => {
                            const user: DiscordUser | undefined =
                                bot.users.cache.get(p.user_id);
                            if (!user) return "-# error";
                            return `**<@${user.id}>**    ||(${user.displayName})||`;
                        })
                        .join("\n"),
                },
            ]);
        } else if (user) {
            // set guild member
            member = await interaction.guild!.members.fetch(user.id);

            // Change title
            embed.setTitle(
                `Rôles de **__${member.nickname ?? member.displayName}__**`,
            );
            embed.addFields({
                name: "Profile link",
                value: `**<@${user.id}>** ||(${member.nickname ?? member.displayName})||`,
                inline: false,
            });

            // Get all roles of the user
            const keys = ["user_id", "guild_id"];
            const values: (number | bigint | string)[] = [user.id, guildId];
            if (setl) {
                keys.push("settlement_id");
                values.push(setl.id);
            }
            const provs: Fournisseur[] = (
                await Fournisseur.fetchArray({
                    keys: keys,
                    values: values,
                })
            ).toSorted((p1: Fournisseur, p2: Fournisseur): number =>
                p1.coordinator < p2.coordinator ? 1 : -1,
            );

            if (provs.length === 0) {
                await interaction.editReply(
                    `Pas de rôles trouvés pour **${member.nickname ?? member.displayName}**`,
                );
                return;
            }

            // Construct embed
            provs.forEach((p: Fournisseur) => {
                embed.addFields({
                    name: p.profession_name,
                    value: p.coordinator
                        ? "**🔧** Coordinateur"
                        : "Fournisseur",
                    inline: false,
                });
            });
        } else {
            // TODO: fetch all of server
        }

        await interaction.editReply({
            embeds: [embed],
        });
        return;
    }

    // Ensure only coordinators of the right pole OR admins are executing this
    let keys: Array<string> = ["user_id"];
    let values: Array<number | bigint | string> = [interaction.user.id];
    if (setl) {
        keys.push("settlement_id");
        values.push(setl.id);
    }
    const provt = await Fournisseur.get({
        keys: keys,
        values: values,
    });
    if (
        (!provt || !provt.coordinator || provt.profession_name !== prof) &&
        !config.admins?.includes(interaction.user.id)
    ) {
        await interaction.reply({
            content: "-# You are not authorized to perform this action.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Defer reply (might take more than 5 seconds since accessing DB)
    await interaction.deferReply();

    // Get whether we're changing coordinators and whether we want to delete or add
    const coord: boolean =
        interaction.options.getBoolean("coordinateur") ?? false;
    const del: boolean = interaction.options.getBoolean("retirer") ?? false;

    // Ensure only admins can change who is coordinator
    if (
        coord &&
        (!config.admins || !config.admins.includes(interaction.user.id))
    ) {
        await interaction.reply(
            "-# You are not authorized to perform this action.",
        );
        return;
    }

    // Create USER Profile if it doesn't exist
    await User.ensureUserExists(user.id, user.username);

    // Main logic (spaghetti, i ain't touching that shit)

    keys = ["user_id", "guild_id", "profession_name"];
    values = [user.id, guildId, prof];
    if (setl) {
        keys.push("settlement_id");
        values.push(setl.id);
    }
    const exists = await Fournisseur.get({
        keys: keys,
        values: values,
    });
    if (del && !coord) {
        if (!exists)
            await interaction.editReply(
                `L'utilisateur **<@${user.id}>** n'étais déjà **pas** __fournisseur__ pour **${prof}${setl ? ` *pour __(${setl.s_name})__*` : ""}.`,
            );
        else if (await exists.delete())
            await interaction.editReply(
                `L'utilisateur **<@${user.id}>** a bien été retiré de la liste de __fournisseurs__ pour **${prof}**${setl ? ` *pour __(${setl.s_name})__*` : ""}.`,
            );
        else
            await interaction.editReply(
                `Une erreur s'est produite, **<@${user.id}>** n'a pas pu être retiré de la DB en tant que _Fournisseur___${setl ? ` *pour __(${setl.s_name})__*` : ""}.`,
            );
    } else {
        const prov = new Fournisseur();
        if (exists) {
            if (coord) {
                if (exists.coordinator != del) {
                    await interaction.editReply(
                        `**<@${user.id}>** est déjà ${del ? "**pas**" : ""} __coordinateur__ de **${prof}**${setl ? ` *pour __(${setl.s_name})__*` : ""}.`,
                    );
                    return;
                } else {
                    exists.coordinator = !del;
                }
            } else {
                await interaction.editReply(
                    `**<@${user.id}>** est déjà __fournisseur__ de **${prof}**${setl ? ` *pour __(${setl.s_name})__*` : ""}.`,
                );
                return;
            }
        } else {
            prov.user_id = user.id;
            prov.guild_id = guildId;
            prov.settlement_id = setl?.id ?? null;
            prov.coordinator = coord;
            prov.profession_name = prof;
        }
        if (exists && coord ? await exists.update() : await prov.insert())
            await interaction.editReply(
                `**<@${user.id}>** a bien été ${del ? "retiré" : "ajouté"} comme __${coord ? "coordinateur" : "fournisseur"}__ de **${prof}**${setl ? ` *pour __(${setl.s_name})__*` : ""}`,
            );
        else
            await interaction.editReply(
                `Une erreur s'est produite, **<@${user.id}>** n'a pas été ${del ? "retiré" : "ajouté"} comme __${coord ? "coordinateur" : "fournisseur"}__ pour **${prof}**${setl ? ` *pour __(${setl.s_name})__*` : ""}`,
            );
    }
}

async function data() {
    const professions = await getProfessionsStringSelectCommandArg();
    const settlements = await getSettlementsHelper(__dirname, true);
    return new SlashCommandBuilder()
        .setName("gerer_fournisseur")
        .setDescription(
            "Gérer la liste des fournisseurs . Retirer un fournisseur lui retire aussi son rôle de coordinateur.",
        )
        .addStringOption((option) =>
            option
                .setName("claim")
                .setDescription("Nom du claim")
                .setRequired(false)
                .addChoices(settlements),
        )
        .addStringOption((option) =>
            option
                .setName("profession")
                .setDescription("Profession à lui assigner")
                .setRequired(false)
                .setChoices(professions),
        )
        .addUserOption((option) =>
            option
                .setName("membre")
                .setDescription(
                    "Utilisateur que vous souhaitez passer fournisseur",
                )
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName("coordinateur")
                .setDescription(
                    "True: gérer status coordinateur (False par défaut)",
                )
                .setRequired(false),
        )
        .addBooleanOption((option) =>
            option
                .setName("retirer")
                .setDescription(
                    "True: retirer, False: ajouter (False par défaut)",
                )
                .setRequired(false),
        );
}

module.exports = {
    data: data,

    execute: manageProvider,
    help: () =>
        primaryEmbed({
            title: "gerer_fournisseur | Aide",
            description:
                "" +
                "Cette commande sert," +
                "- Pour les admins: à modifier la liste des coordinateurs" +
                "- Pour les coordinateurs: à modifier la liste des fournisseurs" +
                "- Pour tout le monde: voir la liste des fournisseurs/coordinateurs, en fonction de:" +
                "  - un utilisateur (si claim n'est pas précisé, ça donnera ses rôles globaux (s'il en a)" +
                "  - un rôle (si claim n'est pas précisé, ça donnera ses fournisseurs/coordinateurs globaux (s'il en a)" +
                "  - ~~un claim: ça donnera la liste de tous les fournisseurs et coordinateurs du claim~~" +
                "  - ~~rien: donne tout pour tous les rôles (si claim n'est pas précisé, alors tous les rôles globaux seront donnés)~~" +
                "",
        }),
};
