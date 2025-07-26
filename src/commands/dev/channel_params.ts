import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import { ChannelParam, DbOptions } from "../../db/dbTypes";

async function channelParams(
    interaction: ChatInputCommandInteraction,
    config: any,
) {
    if (!config.admins || !config.admins.includes(interaction.user.id)) {
        await interaction.reply({
            content: "Only bot admins can use this command.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const commandName: string =
        interaction.options.getString("command_name") ?? "";
    const channelId: string = interaction.options.getString("channel_id") ?? "";
    const guildId: string =
        interaction.options.getString("guild_id") ??
        interaction.guild?.id ??
        interaction.guildId ??
        "";
    const keys: string[] = [];
    const values: string[] = [];
    if (commandName) {
        keys.push("command_name");
        values.push(commandName);
    }
    if (channelId) {
        keys.push("channel_id");
        values.push(channelId);
    }
    if (guildId) {
        keys.push("guild_id");
        values.push(guildId);
    }
    const options: DbOptions | null = keys.length
        ? { keys: keys, values: values }
        : null;

    let params = ChannelParam.fetch(options);

    if (!params) {
        await interaction.editReply("No channel params were found.");
        return;
    } else if (!Array.isArray(params)) params = [params];

    const resp =
        "Channel params:\n" +
        params.map((p: ChannelParam): string => p.toString()).join("\n");

    await interaction.editReply(resp);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("channel_params")
        .setDescription("Fetch all channel params of the bot")
        .addStringOption((option) =>
            option
                .setName("command_name")
                .setDescription(
                    "Name of the command you want to see channel command params of",
                )
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("channel_id")
                .setDescription(
                    "Id of the channel you want to see channel command params of",
                )
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("guild_id")
                .setDescription(
                    "Id of the guild you want to see channel command params of",
                )
                .setRequired(false),
        ),
    execute: channelParams,
};
