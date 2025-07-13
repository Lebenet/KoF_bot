const { SlashCommandBuilder } = require("discord.js");
const { lockBot, unlockBot } = require("../../utils/configLoader");

async function lock(interaction, _config) {
    const locked = interaction.options.getBoolean("lock");

    if (locked) lockBot();
    else unlockBot();

    await interaction.reply("operation succesfull");
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
