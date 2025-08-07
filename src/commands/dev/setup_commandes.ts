import {
    SlashCommandBuilder,
    MessageFlags,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
    Client,
    ChannelType,
    TextChannel,
    ForumChannel,
} from "discord.js";
import { ChannelParam, Settlement } from "../../db/dbTypes";
import { getSettlementsHelper } from "../../utils/discordUtils";

async function setupCommands(
    interaction: ChatInputCommandInteraction,
    config: any,
) {
    if (!config.admins || !config.admins.includes(interaction.user.id)) {
        interaction.reply(
            "Seuls les admins du bot peuvent effectuer cette action.",
        );
        return;
    }

    type TFChannel = TextChannel | ForumChannel;
    const bot: Client = config.bot;

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channelRaw = interaction.options.getChannel("salon");
    let channel: TFChannel;

    if (!channelRaw) {
        const fetched = bot.channels.cache.get(interaction.channelId);

        if (
            fetched &&
            [ChannelType.GuildText, ChannelType.GuildForum].includes(
                fetched.type,
            )
        ) {
            channel = fetched as TFChannel;
        } else {
            await interaction.editReply(
                "Cette action doit soit être effectuée depuis un salon texte/forum, soit choisir un salon texte/forum.",
            );
            return;
        }
    } else {
        channel = channelRaw as TFChannel;
    }

    const panel = interaction.options.getChannel("panel") as TFChannel;

    if (!interaction.guild?.id && !interaction.guildId)
        throw new Error("Unable to get guild ID.");
    const guildId: string = (interaction.guild?.id ??
        interaction.guildId) as string;

    const claimId = interaction.options.getString("claim");
    let setl: Settlement | null = null;
    if (claimId) setl = Settlement.get({ keys: "id", values: claimId });
    if (!setl && claimId) {
        await interaction.editReply("Claim pas trouvé !");
        return;
    }

    let param = ChannelParam.getParam(
        guildId,
        "commander",
        "commandes_channel_id",
        setl?.id ?? null,
    );

    let param2 = ChannelParam.getParam(
        guildId,
        "commander",
        "panel_channel_id",
        setl?.id ?? null,
    );

    let s1 = false;
    if (param) {
        param.channel_id = channel.id;
        s1 = param.update();
    } else {
        param = new ChannelParam();
        param.guild_id = guildId;
        param.command_name = "commander";
        param.command_param = "commandes_channel_id";
        param.settlement_id = setl?.id;
        param.channel_id = channel.id;
        s1 = param.insert() ? true : false;
    }

    let s2 = false;
    if (param2) {
        param2.channel_id = panel.id;
        s2 = param2.update();
    } else {
        param2 = new ChannelParam();
        param2.guild_id = guildId;
        param2.command_name = "commander";
        param2.command_param = "panel_channel_id";
        param2.settlement_id = setl?.id;
        param2.channel_id = panel.id;
        s2 = param2.insert() ? true : false;
    }
    if (s1 && s2) {
        await interaction.editReply(
            `Le salon <#${channel.id}> a bien été set comme salon pour les commandes de matériel et <#${panel.id}> comme panel.`,
        );
        return;
    }
    // If an insert failed
    await interaction.editReply(`Les salons n'ont pas pu être ajouté.`);
    console.log(param);
    console.log(param.delete());
    console.log(param2);
    console.log(param2.delete());
}

module.exports = {
    data: () =>
        new SlashCommandBuilder()
            .setName("setup_commandes")
            .setDescription(
                "Définir le salon dans lequel les commandes seront gérées.",
            )
            .addChannelOption((option) =>
                option
                    .setName("panel")
                    .setDescription("Panel des commandes disponibles")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText),
            )
            .addChannelOption((option) =>
                option
                    .setName("salon")
                    .setDescription("Salon à choisir (optionnel)")
                    .setRequired(false)
                    .addChannelTypes(
                        ChannelType.GuildText,
                        ChannelType.GuildForum,
                    ),
            )
            .addStringOption((option) =>
                option
                    .setName("claim")
                    .setDescription(
                        "Le claim à choisir (optionnel, si omis = global au serveur)",
                    )
                    .setRequired(false)
                    .addChoices(getSettlementsHelper(__dirname, true)),
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: setupCommands,
};
