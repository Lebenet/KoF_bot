const { SlashCommandBuilder } = require("discord.js");

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

/*
Command to publish a test command|task to prod
Requires bot admin
*/

const dirName = (type) => { ["command", "task"].includes(type) ? type + "s" : undefined };

async function publish(interaction, config) {
    try {
        // Give more time in case something weird happens with the filesystem
        await interaction.deferReply();

        // Check user has sufficient permissions
        if (!config.admins || !config.admins.includes(interaction.member.user.id)) {
            await interaction.editReply({
                content: `Only bot admins can use this command.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Get the correct directory
        const dir = dirName(interaction.options.getString("type"));
        if (!dir) {
            await interaction.editReply({
                content: `This type isn't publishable.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        
        // Get the file from the command arg
        const name = interaction.options.getString("name");
        const file = path.resolve(`./${dir}/dev/${name}.js`);

        // Check if the file exists
        try {
            await fsp.access(file, fs.constants.F_OK);
        } catch (err) {
            console.error(
                `[ERROR] | publish: File ${file} does not exist: \n`,
                err,
            );
            await interaction.editReply({
                content: `Command|Task **\`/${name}\`** does not exist.`,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Copy to dir
        const dst = path.resolve(`./${dir}/public/${name}.js`);
        fs.copyFile(file, dst, async (err) => {
            if (err) {
                console.error(
                    `[ERROR] | publish: An error occured while publishing ${name} command|task:\n`,
                    err,
                );
                await interaction.editReply({
                    content: `Error while publishing **\`/${name}\`** command|task.`,
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                console.log(
                    `[COMMANDS] | publish: Succesfully published the ${name} command|task.`,
                );
                await interaction.editReply({
                    content: `Succesfully published the **\`/${name}\`** command|task.`,
                    flags: MessageFlags.Ephemeral,
                });
            }
        });
    } catch (err) {
        console.error("[ERROR] | publish: Something went wrong:\n", err);
        await interaction.editReply({
            content: "Something went wrong.",
            flags: MessageFlags.Ephemeral,
        });
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("publish")
        .setDescription("Makes a dev-only command|task public")
        .addStringOption((option) =>
            option
                .setName("type")
                .setDescription("Type (command|task)")
                .setRequired(true)
        )
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("Name of what you wish to publish")
                .setRequired(true),
        ),

    execute: publish,
};
