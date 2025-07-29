import {
    APIEmbedField,
    ClientUser,
    Colors,
    EmbedAuthorOptions,
    EmbedBuilder,
    EmbedFooterOptions,
    SlashCommandBuilder,
} from "discord.js";
import { Profession } from "../db/dbTypes";
import { getGuildCommands } from "./commandLoader";
import { getGuildTasks } from "./taskLoader";
import { getConfig } from "./configLoader";

export function getProfessionsStringSelectCommandArg(): {
    name: string;
    value: string;
}[] {
    const ps = Profession.fetch();
    if (!ps)
        return [
            { name: "error:no_profession_found", value: "no_profession_found" },
        ];
    return (Array.isArray(ps) ? ps : [ps]).map((p) => {
        return { name: p.description, value: p.p_name };
    });
}

export function getProfessionsStringSelectMessageComp(): {
    label: string;
    value: string;
}[] {
    const ps = Profession.fetch();
    if (!ps)
        return [
            {
                label: "error:no_profession_found",
                value: "no_profession_found",
            },
        ];
    return (Array.isArray(ps) ? ps : [ps]).map((p) => {
        return { label: p.description, value: p.p_name };
    });
}

export function getCommandsHelper(
    guildId: string,
): { name: string; value: string; args?: string[] | undefined }[] {
    const commands = getGuildCommands(guildId);
    return [
        ...commands.keys().map((k: string) => {
            return {
                name: k,
                value: k,
                args: [
                    ...(commands.get(k).data as SlashCommandBuilder)
                        .toJSON()
                        .options!.map((option) => option.name),
                ],
            };
        }),
    ];
}

export function getTasksHelper(
    guildId: string,
): { name: string; value: string }[] {
    const tasks = getGuildTasks(guildId);
    return [
        ...tasks.keys().map((k: string) => {
            return { name: k, value: k };
        }),
    ];
}

// Custom Embed Builder

function globalEmbedFactory(embedType: EmbedType, color: number): EmbedBuilder {
    const client: ClientUser = getConfig().bot.user;
    const embed = new EmbedBuilder().setColor(color);

    if (embedType.title) {
        embed.setTitle(embedType.title);
    }

    if (embedType.description) {
        embed.setDescription(embedType.description);
    }

    if (embedType.fields) {
        embed.addFields(embedType.fields);
    }

    if (embedType.footer) {
        embed.setFooter(embedType.footer);
    } else {
        embed.setFooter({
            text: "WIP. Contact `lebenet` for requests.",
            iconURL: client.avatarURL()!,
        });
    }

    if (embedType.author) {
        embed.setAuthor(embedType.author);
    } else {
        embed.setAuthor({
            name: client.displayName,
            iconURL: client.avatarURL()!,
        });
    }

    if (embedType.timestamp) {
        embed.setTimestamp();
    }

    if (embedType.thumbnail) {
        embed.setThumbnail(embedType.thumbnail);
    }

    if (embedType.image) {
        embed.setImage(embedType.image);
    }

    return embed;
}

export function primaryEmbed(embedType: EmbedType) {
    return globalEmbedFactory(embedType, Colors.DarkBlue);
}

export function warningEmbed(embedType: EmbedType) {
    return globalEmbedFactory(embedType, Colors.DarkOrange);
}

export function successEmbed(embedType: EmbedType) {
    return globalEmbedFactory(embedType, Colors.Green);
}

export function dangerEmbed(embedType: EmbedType) {
    return globalEmbedFactory(embedType, Colors.Red);
}

export function personalEmbed(embedType: EmbedType, color: number) {
    return globalEmbedFactory(embedType, color);
}

export type EmbedType = {
    title?: string;
    description?: string;
    fields?: APIEmbedField[];
    footer?: EmbedFooterOptions;
    author?: EmbedAuthorOptions;
    timestamp?: boolean;
    thumbnail?: string;
    image?: string;
};

// End Custom Embed Builder
