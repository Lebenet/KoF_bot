console.time("imports");
import {
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
} from "discord.js";
import { Config } from "../../utils/configLoader";
import { updateGsheetsSkills } from "../../utils/discordUtils";
console.timeEnd("imports");

async function getMappedData(
    interaction: ChatInputCommandInteraction,
    _config: Config,
): Promise<void> {
    interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch();
    updateGsheetsSkills()
        .then(() => {
            interaction.editReply("Done").catch();
            setTimeout(() => interaction.deleteReply().catch(), 5_000);
        })
        .catch();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("test_update_ghseets")
        .setDescription("ouais")
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: getMappedData,
};
