const {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} = require("discord.js");

async function testmodal(interaction, config) {
    await interaction.showModal(
        new ModalBuilder()
            .setCustomId("customid")
            .setTitle("Test Modal")
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId("testid")
                        .setLabel("the test")
                        .setStyle(TextInputStyle.Short)
                        .setPlaceholder("a placeholder"),
                ),
            ),
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("testmodal")
        .setDescription(
            "A modal to test modal data saving when bot is locked.",
        ),

    execute: testmodal,
};
