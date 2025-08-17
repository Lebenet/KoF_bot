import {
    APIApplicationCommandOptionChoice,
    APIEmbedField,
    APISelectMenuOption,
    ClientUser,
    Colors,
    EmbedAuthorOptions,
    EmbedBuilder,
    EmbedFooterOptions,
    SlashCommandBuilder,
} from "discord.js";
import { Profession, Settlement, Skill, SkillKind, User } from "../db/dbTypes";
import { getGuildCommands } from "./commandLoader";
import { getGuildTasks } from "./taskLoader";
import { getConfig } from "./configLoader";
import { getParisDatetimeSQLiteSafe } from "./taskUtils";

export const reloadDummyDiscordUtils = "..s.";

export const dirName = (dir: string): string =>
    dir.replace(/.*\/(dev|public)$/, "$1");
export const getGuildId = (dirName: string): string =>
    (dirName === "dev" ? process.env.DEV_GUILD_ID : process.env.GUILD_ID) ??
    "0";

export function getProfessionsStringSelectCommandArg(): APIApplicationCommandOptionChoice<string>[] {
    const ps = Profession.fetch();
    if (!ps)
        return [
            { name: "error:no_profession_found", value: "no_profession_found" },
        ];
    return (Array.isArray(ps) ? ps : [ps]).map((p) => {
        return { name: p.p_name, value: p.p_name };
    });
}

export function getProfessionsStringSelectMessageComp(): APISelectMenuOption[] {
    const ps = Profession.fetch();
    if (!ps)
        return [
            {
                label: "error:",
                description: "no_profession_found",
                value: "no_profession_found",
            },
        ];
    return (Array.isArray(ps) ? ps : [ps]).map((p) => {
        const emojiParts: string[] = p.emoji
            .replace(/[<>]/g, "")
            .split(":")
            .filter((e) => e);
        const emoji = {
            name: emojiParts[0],
            id: emojiParts.length > 1 ? emojiParts[1] : undefined,
        };

        return {
            label: p.description,
            value: p.p_name,
            description: p.p_name,
            emoji: emoji,
        };
    });
}

// For the following 3 functions:
// dir: true means guildId is actually the __dirname to get the guild id from
export function getCommandsHelper(
    guildId: string,
    dir?: boolean,
): { name: string; value: string; args?: string[] | undefined }[] {
    if (dir) guildId = getGuildId(dirName(guildId));
    const commands = getGuildCommands(guildId);
    return [
        ...commands.keys().map((k: string) => {
            const data =
                commands.get(k)?.data ??
                new SlashCommandBuilder().setName("Unknown");
            return {
                name: k,
                value: k,
                args: [
                    ...(typeof data === "function" ? data() : data)
                        .toJSON()
                        .options!.map(
                            (option) =>
                                `${option.required ? "**\\***" : ""}${option.name}`,
                        ),
                ],
            };
        }),
    ];
}

export function getTasksHelper(
    guildId: string,
    dir?: boolean,
): { name: string; value: string }[] {
    if (dir) guildId = getGuildId(dirName(guildId));
    const tasks = getGuildTasks(guildId);
    return [
        ...tasks.keys().map((k: string) => {
            return { name: k, value: k };
        }),
    ];
}

export function getSettlementsHelper(
    guildId: string,
    dir?: boolean,
): { name: string; value: string }[] {
    if (dir) guildId = getGuildId(dirName(guildId));
    const claims = Settlement.fetchArray({ keys: "guild_id", values: guildId });
    return claims.map((s: Settlement) => {
        return {
            name: s.s_name,
            value: `${s.id}`,
        };
    });
}

const levels: Record<number, number> = {
    0: 1,
    640: 2,
    1340: 3,
    2130: 4,
    2990: 5,
    3950: 6,
    5000: 7,
    6170: 8,
    7470: 9,
    8900: 10,
    10480: 11,
    12230: 12,
    14160: 13,
    16300: 14,
    18660: 15,
    21280: 16,
    24170: 17,
    27360: 18,
    30900: 19,
    34800: 20,
    39120: 21,
    43900: 22,
    49180: 23,
    55020: 24,
    61480: 25,
    68620: 26,
    76520: 27,
    85250: 28,
    94900: 29,
    105580: 30,
    117380: 31,
    130430: 32,
    144870: 33,
    160820: 34,
    178470: 35,
    197980: 36,
    219550: 37,
    243400: 38,
    269780: 39,
    298940: 40,
    331190: 41,
    366850: 42,
    406280: 43,
    449870: 44,
    498080: 45,
    551380: 46,
    610320: 47,
    675490: 48,
    747550: 49,
    827230: 50,
    915340: 51,
    1012760: 52,
    1120480: 53,
    1239590: 54,
    1371290: 55,
    1516920: 56,
    1677940: 57,
    1855990: 58,
    2052870: 59,
    2270560: 60,
    2511270: 61,
    2777430: 62,
    3071730: 63,
    3397150: 64,
    3756970: 65,
    4154840: 66,
    4594770: 67,
    5081220: 68,
    5619100: 69,
    6213850: 70,
    6871490: 71,
    7596660: 72,
    8394710: 73,
    9268520: 74,
    10223770: 75,
    11361840: 76,
    12563780: 77,
    13892800: 78,
    15362330: 79,
    16987240: 80,
    18783950: 81,
    20770630: 82,
    22967360: 83,
    25396360: 84,
    28082170: 85,
    31051960: 86,
    34335740: 87,
    37966720: 88,
    41981610: 89,
    46421000: 90,
    51329760: 91,
    56757530: 92,
    62759190: 93,
    69394400: 94,
    76729260: 95,
    84836300: 96,
    93794960: 97,
    103692650: 98,
    114626640: 99,
    126704730: 100,
};

export function xpToLevel(xp: number): number {
    // return Math.round(1 + 62/9*Math.log2(1 + e.quantity/6020)); // Doesn't work well
    const keys = Object.keys(levels)
        .map(Number)
        .sort((a, b) => b - a); // descending

    for (const totalXp of keys) {
        if (xp >= totalXp) return levels[totalXp];
    }

    return 1; // fallback
}

// Custom Embed Builder
function globalEmbedFactory(embedType: EmbedType, color: number): EmbedBuilder {
    const client: ClientUser | null = getConfig().bot.user;
    if (!client)
        return new EmbedBuilder().setTitle("Error").setColor(Colors.Red);

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
        if (typeof embedType.timestamp === "boolean") embed.setTimestamp();
        else embed.setTimestamp(embedType.timestamp);
    }

    if (embedType.thumbnail) {
        embed.setThumbnail(embedType.thumbnail);
    }

    if (embedType.image) {
        embed.setImage(embedType.image);
    }

    return embed;
}

export function blandEmbed(embedType: EmbedType) {
    return globalEmbedFactory(embedType, Colors.DarkGrey);
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
    timestamp?: boolean | Date;
    thumbnail?: string;
    image?: string;
};

// End Custom Embed Builder

export async function updateSkills(
    user: string | User,
): Promise<
    { success: false; error?: string } | { success: true; message?: string }
> {
    if (typeof user === "string") {
        const usr = new User();
        usr.id = user;
        if (!usr.sync()) {
            console.error(`[ERROR] updateSkills: DB error on user sync.`);
            return {
                success: false,
                error: "Erreur de DB ! Veuillez réessayer.",
            };
        }
        user = usr;
    }

    const playerId = user.player_id;
    if (!playerId)
        return {
            success: false,
            error: "Cet utilisateur n'est pas link. Merci de lui faire faire `/link`.",
        };

    const currTime = new Date(getParisDatetimeSQLiteSafe());
    // If user has already fetched skills recently
    if (
        user.last_updated_skills &&
        user.last_updated_skills.getTime() + 5 * 60_000 >= currTime.getTime()
    )
        return {
            success: false,
            error: "Vos skills ont déjà été update récemment.",
        };

    user.last_updated_skills = currTime;
    if (!user.update()) {
        console.error(`[ERROR] updateSkills: DB error on user update.`);
        return {
            success: false,
            error: "Erreur de DB en updatant vos informations ! Veuillez réessayer.",
        };
    }
    // const playerName = user.player_username!;

    // custom types for typescript (and easier debug)
    type skillMapEntry = {
        id: number;
        name: string;
        title: string;
        skillCategoryStr: string;
    };
    type skillMap = { [key: string]: skillMapEntry };

    type experienceListEntry = {
        quantity: number;
        skill_id: number;
    };
    type experienceList = experienceListEntry[];

    type Data = {
        experience: experienceList;
        skillMap: skillMap;
    };

    // Fetch data
    const res = await fetch(`https://bitjita.com/api/players/${playerId}`, {
        method: "GET",
        headers: {
            "User-Agent": "Notary - lebenet on discord",
        },
    });

    // Try to parse it
    try {
        const json = await res.json();
        if (json.error)
            return { success: false, error: "L'ID rentré n'est pas bon !" };

        const data: Data = json.player;

        const skills: Map<string, string> = new Map();
        const known_professions: string[] = Profession.fetchArray().map(
            (p) => p.p_name,
        );
        Object.entries(data.skillMap as skillMap)
            .filter(([_, v]) => v.title !== "")
            .forEach(([k, v]) => skills.set(k, v.name));

        const experience = data.experience
            .toSorted((e1, e2) => e1.skill_id - e2.skill_id)
            .map((e) => {
                return {
                    profession_name: skills.get(`${e.skill_id}`)!,
                    xp: e.quantity,
                    level: xpToLevel(e.quantity),
                };
            }) // TOKNOW: Level calc is approximative
            .filter((sk) => known_professions.includes(sk.profession_name));

        experience.forEach((e) => {
            const sk = new Skill();
            // PKs
            sk.user_id = user.id;
            sk.profession_name = e.profession_name;
            // values to update
            sk.level = e.level;
            sk.xp = e.xp;

            if (!sk.update()) {
                console.warn(
                    `[WARN] update skills: couldn't update skill ${sk.profession_name} for ${user.player_username}.\nAttempting insert...`,
                );
                if (!sk.insert())
                    console.warn(
                        `[WARN] update skills: couldn't insert either.`,
                    );
                // else console.log(sk);
            }
            // else console.log(sk);
        });
    } catch (err) {
        console.error(`[ERROR] updateSkills: error on reading data.`, err);
        return {
            success: false,
            error: "Erreur en lisant les données du site.\nSi le site fonctionne, merci de contacter `lebenet`.",
        };
    }

    return {
        success: true,
        message:
            "Update réussie ! La page des skills devrait maintenant être à jour.",
    };
}

const _emojisSkillsMap = new Map<string, string>();
const _kindSkillsMap = new Map<string, SkillKind>();

export function getEmoji(skill: string) {
    if (_emojisSkillsMap.size === 0)
        Profession.fetchArray().forEach((p) =>
            _emojisSkillsMap.set(p.p_name, p.emoji),
        );

    return _emojisSkillsMap.get(skill);
}

export function getKind(skill: string): SkillKind {
    if (_kindSkillsMap.size === 0)
        Profession.fetchArray().forEach((p) =>
            _kindSkillsMap.set(p.p_name, p.kind as SkillKind),
        );

    return _kindSkillsMap.get(skill)!;
}

export function shortenText(text: string, size: number) {
    if (text.length < size - 4) return text;
    return text.slice(0, size - 4) + "...";
}

export function shortenTitle(text: string) {
    return shortenText(text, 100);
}

export function shortenMessage(text: string) {
    return shortenText(text, 2000);
}

export function shortenEmbedTitle(text: string) {
    return shortenText(text, 255);
}

export function shortenEmbedDescription(text: string) {
    return shortenText(text, 4000);
}

export function shortenEmbedFieldName(text: string) {
    return shortenEmbedTitle(text);
}

export function shortenEmbedFieldValue(text: string) {
    return shortenText(text, 1000);
}
