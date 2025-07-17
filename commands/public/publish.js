const { SlashCommandBuilder, MessageFlags } = require("discord.js");

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

/*
Command to publish a test command to prod
Requires bot admin
*/

async function publish(interaction, config) {
    try {
        // Give more time in case something weird happens with the filesystem
        await interaction.deferReply();

        // Check user has sufficient permissions
        if (!config.admins.includes(interaction.member.user.id)) {
            await interaction.editReply({
                content: `Only bot admins can use this command.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Get the file from the command arg
        const cmd = interaction.options.getString("command");
        const file = path.resolve(`commands/dev/${cmd}.js`);

        // Check if the file exists
        try {
            await fsp.access(file, fs.constants.F_OK);
        } catch (err) {
            console.error(
                `[ERROR] | Publish: File ${file} does not exist: \n`,
                err,
            );
            await interaction.editReply({
                content: `Command **\`/${cmd}\`** does not exist.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Copy to /commands/
        const dst = path.resolve(`./commands/public/${cmd}.js`);
        fs.copyFile(file, dst, async (err) => {
            if (err) {
                console.error(
                    `[ERROR] | Publish: An error occured while publishing ${cmd} command:\n`,
                    err,
                );
                await interaction.editReply({
                    content: `Error while publishing **\`/${cmd}\`** command.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                console.log(
                    `[COMMANDS] | Publish: Succesfully published the ${cmd} command.`,
                );
                await interaction.editReply({
                    content: `Succesfully published the **\`/${cmd}\`** command.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        });
    } catch (err) {
        console.error("[ERROR] | Publish: Something went wrong:\n", err);
        await interaction.editReply({
            content: "Something went wrong.",
            flags: MessageFlags.Ephemeral,
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("publish")
        .setDescription("Makes a dev-only command public")
        .addStringOption((option) =>
            option
                .setName("command")
                .setDescription("Name of the command you wish to publish")
                .setRequired(true),
        ),

    execute: publish,
};
