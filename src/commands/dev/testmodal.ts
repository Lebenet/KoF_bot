import {
    SlashCommandBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ChatInputCommandInteraction,
    ModalSubmitInteraction,
} from "discord.js";

async function testmodal(
    interaction: ChatInputCommandInteraction,
    _config: any,
) {
    await interaction.showModal(
        new ModalBuilder()
            .setCustomId(`${interaction.guildId}|testmodal|testHandler`)
            .setTitle("Test Modal")
            .addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId(`testId`)
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
    testHandler: async function (
        interaction: ModalSubmitInteraction,
        _config: any,
    ) {
        if (interaction.replied || interaction.deferred)
            interaction.editReply("Modal received");
        else interaction.reply("Modal received");
    },
};
