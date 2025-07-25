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
import { ChannelParam } from "../../db/dbTypes";

async function setupCommands(
    interaction: ChatInputCommandInteraction,
    config: any,
) {
    if (!config.admins || !config.admins.includes(interaction.user.id)) {
        await interaction.reply(
            "Seuls les admins du bot peuvent effectuer cette action.",
        );
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
            interaction.editReply(
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

    const param: ChannelParam = new ChannelParam();
    param.channel_id = channel.id;
    param.command_name = "commander";
    param.command_param = "commandes_channel_id";
    param.guild_id = guildId;

    const param2: ChannelParam = new ChannelParam();
    param2.channel_id = panel.id;
    param2.command_name = "commander";
    param2.command_param = "panel_channel_id";
    param2.guild_id = guildId;

    let s1 = false;
    let s2 = false;
    // If param already exists
    if (param.sync()) {
        // Change its value
        param.channel_id = channel.id;
        s1 = param.update();
    } else s1 = param.insert() ? true : false; // Else just insert

    // Same logic here
    if (param2.sync()) {
        param2.channel_id = panel.id;
        s2 = param2.update();
    } else s2 = param2.insert() ? true : false;

    if (s1 && s2) {
        await interaction.editReply(
            `Le salon <#${channel.id}> a bien été set comme salon pour les commandes de matériel et <#${panel.id}> comme panel.`,
        );
        return;
    }
    // If an insert failed
    await interaction.editReply(`Les salons n'ont pas pu être ajouté.`);
    param.delete();
    param2.delete();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup_commandes")
        .setDescription(
            "Définir le salon dans lequel les commandes seront gérées.",
        )
        .addChannelOption((option) =>
            option
                .setName("panel")
                .setDescription("Panel des commandes disponibles")
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum),
        )
        .addChannelOption((option) =>
            option
                .setName("salon")
                .setDescription("Salon à choisir (optionnel)")
                .setRequired(false)
                .addChannelTypes(ChannelType.GuildText, ChannelType.GuildForum),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: setupCommands,
};
