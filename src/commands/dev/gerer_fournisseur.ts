import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    User as DiscordUser,
    EmbedBuilder,
    Client,
    MessageFlags,
} from "discord.js";
import { User, Fournisseur } from "../../db/dbTypes";
import { getProfessions } from "../../utils/discordUtils";

async function manageProvider(
    interaction: ChatInputCommandInteraction,
    config: any,
) {
    // Targeted profession
    const prof: string | null = interaction.options.getString("profession");

    // Get referenced member
    const user: DiscordUser | null = interaction.options.getUser("membre");

    // Guild ID
    const guildId: string = (interaction.guild?.id ??
        interaction.guildId) as string;

    // If only trying to get information, not changing stuff
    // FIXME: WIP
    if (!user || !prof) {
        const bot: Client = config.bot;
        if (!bot.user) {
            await interaction.reply(
                "Quelque chose est cassé? Le bot ne se voit même pas!",
            );
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
            const provs: Fournisseur[] = Fournisseur.fetch({
                keys: ["profession_name", "guild_id"],
                values: [prof, guildId],
                array: true,
            }) as Fournisseur[];
            provs.sort((p1: Fournisseur, p2: Fournisseur): number =>
                p1.coordinator < p2.coordinator ? 1 : -1,
            );

            if (provs.length === 0) {
                await interaction.editReply(
                    `Pas de __fournisseur__ n'a été trouvé pour la profession **${prof}**.`,
                );
                return;
            }

            // Construct embed
            provs.forEach((p: Fournisseur) => {
                const user: DiscordUser | undefined = bot.users.cache.get(
                    p.user_id,
                );
                if (!user) return;

                embed.addFields({
                    name: `${p.coordinator ? "**🔧** Coordinateur" : "Fournisseur"}`,
                    value: `**<@${user.id}>** ||(${user.displayName})||`,
                    inline: false,
                });
            });
        } else if (user) {
            // Change title
            embed.setTitle(`Rôles de **__${user.displayName}__**`);
            embed.addFields({
                name: "Profile link",
                value: `**<@${user.id}>** ||(${user.displayName})||`,
                inline: false,
            });

            // Get all roles of the user
            const provs: Fournisseur[] = Fournisseur.fetch({
                keys: ["user_id", "guild_id"],
                values: [user.id, guildId],
                array: true,
            }) as Fournisseur[];
            console.log(provs, typeof provs, Array.isArray(provs));
            provs.sort((p1: Fournisseur, p2: Fournisseur): number =>
                p1.coordinator < p2.coordinator ? 1 : -1,
            );

            if (provs.length === 0) {
                await interaction.editReply(
                    `Pas de rôles trouvés pour **${user.displayName}**`,
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
    const provt: Fournisseur = Fournisseur.fetch({
        keys: "user_id",
        values: interaction.user.id,
        limit: 1,
    }) as Fournisseur;
    if (
        (!provt || !provt.coordinator || provt.profession_name !== prof) &&
        (!config.admins || !config.admins.includes(interaction.user.id))
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
    User.ensureUserExists(user.id, user.username);

    // Main logic (spaghetti, i ain't touching that shit)
    const exists: Fournisseur | null = Fournisseur.fetch({
        keys: ["user_id", "guild_id", "profession_name"],
        values: [user.id, guildId, prof],
        limit: 1,
    }) as Fournisseur | null;
    if (del && !coord) {
        if (!exists)
            await interaction.editReply(
                `L'utilisateur **${user.displayName}** n'étais déjà **pas** __fournisseur__ pour **${prof}.`,
            );
        else if (exists.delete())
            await interaction.editReply(
                `L'utilisateur **${user.displayName}** a bien été retiré de la liste de __fournisseurs__ pour **${prof}**.`,
            );
        else
            await interaction.editReply(
                `Une erreur s'est produite, **${user.displayName}** n'a pas pu être retiré de la DB en tant que __Fournisseur__.`,
            );
    } else {
        const prov = new Fournisseur();
        if (exists) {
            if (coord) {
                if (exists.coordinator != del) {
                    await interaction.editReply(
                        `**${user.displayName}** est déjà ${del ? "**pas**" : ""} __coordinateur__ de **${prof}**.`,
                    );
                    return;
                } else {
                    exists.coordinator = !del;
                }
            } else {
                await interaction.editReply(
                    `**${user.displayName}** est déjà __fournisseur__ de **${prof}**.`,
                );
                return;
            }
        } else {
            prov.user_id = user.id;
            prov.guild_id = guildId;
            prov.coordinator = coord;
            prov.profession_name = prof;
        }
        if (exists && coord ? exists.update() : prov.insert())
            await interaction.editReply(
                `**${user.displayName}** a bien été ${del ? "retiré" : "ajouté"} comme __${coord ? "coordinateur" : "fournisseur"}__ de **${prof}**`,
            );
        else
            await interaction.editReply(
                `Une erreur s'est produite, **${user.displayName}** n'a pas été ${del ? "retiré" : "ajouté"} comme __${coord ? "coordinateur" : "fournisseur"}__ pour **${prof}**`,
            );
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("gerer_fournisseur")
        .setDescription(
            "Gérer la liste des fournisseurs . Rretirer un fournisseur lui retire aussi son rôle de coordinateur.",
        )
        .addStringOption((option) =>
            option
                .setName("profession")
                .setDescription("Profession à lui assigner")
                .setRequired(false)
                .setChoices(getProfessions()),
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
        ),

    execute: manageProvider,
};
