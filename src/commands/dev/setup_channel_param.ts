import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import { ChannelParam } from "../../db/dbTypes";

async function setupChannelParams(
    interaction: ChatInputCommandInteraction,
    config: any,
) {
    if (!config || !config.admins.includes(interaction.user.id)) {
        await interaction.reply({
            content: "Only bot admisn can use this command.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply();
    const channelId: string =
        interaction.options.getString("channel_id") ?? interaction.channelId;
    if (!interaction.guild?.id && !interaction.guildId)
        throw new Error("Unable to get channel ID.");
    const guildId: string = (interaction.guild?.id ??
        interaction.guildId) as string;
    const commandName: string = interaction.options.getString(
        "command_name",
    ) as string;
    const commandParam: string = interaction.options.getString(
        "param_name",
    ) as string;

    const param: ChannelParam = new ChannelParam();
    param.channel_id = channelId;
    param.guild_id = guildId;
    param.command_name = commandName;
    param.command_param = commandParam;
    if (param.insert())
        await interaction.editReply(
            `Succesfully added param ${commandParam} for command ${commandName} as ${channelId}.`,
        );
    else await interaction.editReply(`Failed to insert new param in Database.`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup_channel_param")
        .setDescription(
            "Setup un paramètre de channel pour une commande discord",
        )
        .addStringOption((option) =>
            option
                .setName("command_name")
                .setDescription("Nom de la commande")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("param_name")
                .setDescription("Nom du paramètre")
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("channel_id")
                .setDescription(
                    "Id du salon (Par défault là où tu executes la commande)",
                )
                .setRequired(false),
        ),

    execute: setupChannelParams,
};
