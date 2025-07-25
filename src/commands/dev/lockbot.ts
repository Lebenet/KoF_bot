import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    MessageFlags,
} from "discord.js";
const { lockBot, unlockBot } = require("../../utils/configLoader");

async function lock(interaction: ChatInputCommandInteraction, config: any) {
    if (!config.admins || !config.admins.includes(interaction.user.id)) {
        await interaction.reply({
            content: "Seuls les admins du bot peuvent effectuer cette action.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const locked: boolean | null = interaction.options.getBoolean("lock");

    if (locked) lockBot();
    else unlockBot();

    await interaction.reply(
        `Bot was succesfully ${locked ? "locked" : "unlocked"}.`,
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("lockbot")
        .setDescription("Locks the bot")
        .addBooleanOption((option) =>
            option
                .setName("lock")
                .setDescription("True locks, False unlocks")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: lock,
};
