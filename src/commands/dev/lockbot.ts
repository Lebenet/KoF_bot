import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
const { lockBot, unlockBot } = require("../../utils/configLoader");

async function lock(interaction: ChatInputCommandInteraction, config: any) {
    if (!config.admins || !config.admins.includes(interaction.user.id)) return;

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
        ),

    execute: lock,
};
