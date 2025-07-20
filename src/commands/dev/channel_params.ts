import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import { ChannelParam } from "../../db/dbTypes";

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

    const command_name = interaction.options.getString("command_name") ?? "";
    const options = command_name
        ? { keys: "command_name", values: command_name }
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
                    "Name of the command you want to see channel params of",
                )
                .setRequired(false),
        ),
    execute: channelParams,
};
