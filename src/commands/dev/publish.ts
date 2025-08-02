import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
} from "discord.js";

import fs from "fs";
import fsp from "fs/promises";
import path from "path";

/*
Command to publish a test command|task to prod
Requires bot admin
*/

const dirName = (type: string): string =>
    ["command", "task"].includes(type) ? type + "s" : "";

async function publish(interaction: ChatInputCommandInteraction, config: any) {
    try {
        // Give more time in case something weird happens with the filesystem
        await interaction.deferReply();

        // Check user has sufficient permissions
        if (!config.admins || !config.admins.includes(interaction.user.id)) {
            await interaction.editReply(
                `Only bot admins can use this command.`,
            );
            return;
        }

        // Get the correct directory
        const dir: string = dirName(
            interaction.options.getString("type") ?? "",
        );
        if (!dir) {
            await interaction.editReply(`This type isn't publishable.`);
            return;
        }

        // Get the file from the command arg
        const name = interaction.options.getString("name");

        if (name === "all") {
            fs.readdirSync(path.resolve(`./${dir}/dev`)).forEach((f) => {
                const file = path.resolve(`./${dir}/dev/${f}`);
                const dst = path.resolve(`./${dir}/public/${f}`);
                fs.copyFile(file, dst, async (err) => {
                    if (err) {
                        console.error(
                            `[ERROR] | publish: An error occured while publishing ${name} command|task:\n`,
                            err,
                        );
                        await interaction.editReply(
                            `Error while publishing **\`/${name}\`** command|task.`,
                        );
                    } else {
                        console.log(
                            `[COMMANDS] | publish: Succesfully published the ${name} command|task.`,
                        );
                        await interaction.editReply(
                            `Succesfully deployed every ${dir} to live server.`,
                        );
                    }
                });
            });

            return;
        }

        const file = path.resolve(`./${dir}/dev/${name}.js`);

        // Check if the file exists
        try {
            await fsp.access(file, fs.constants.F_OK);
        } catch (err) {
            console.error(
                `[ERROR] | publish: File ${file} does not exist: \n`,
                err,
            );
            await interaction.editReply(
                `Command|Task **\`/${name}\`** does not exist.`,
            );
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
                await interaction.editReply(
                    `Error while publishing **\`/${name}\`** command|task.`,
                );
            } else {
                console.log(
                    `[COMMANDS] | publish: Succesfully published the ${name} command|task.`,
                );
                await interaction.editReply(
                    `Succesfully published the **\`/${name}\`** command|task.`,
                );
            }
        });
    } catch (err) {
        console.error("[ERROR] | publish: Something went wrong:\n", err);
        await interaction.editReply("Something went wrong.");
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
                .setRequired(true),
        )
        .addStringOption((option) =>
            option
                .setName("name")
                .setDescription("Name of what you wish to publish")
                .setRequired(true),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: publish,
};
