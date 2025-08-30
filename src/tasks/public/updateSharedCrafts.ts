import {
    ChannelManager,
    ChannelType,
    EmbedBuilder,
    HexColorString,
    Message,
} from "discord.js";
import { Profession, SharedCraft, SharedCraftsStatus } from "../../db/dbTypes";
import { Config } from "../../utils/configLoader";
import { TaskData, TaskDataLoad } from "../../utils/taskLoader";
import { shortenText } from "../../utils/discordUtils";

type CraftedItem = {
    item_id: number;
    quantity: number;
    item_type: string;
    durability: number;
};

type LevelRequirements = {
    level: number;
    skill_id: number;
};

type ToolRequirements = {
    level: number;
    power: number;
    tool_type: number;
};

type Craft = {
    entityId: string;
    buildingEntityId: string;
    ownerEntityId: string;
    progress: number;
    recipeId: number;
    craftCount: number;
    lockExpiration: string; // date
    actionsRequiredPerItem: number;
    craftedItem: CraftedItem[];
    levelRequirements: LevelRequirements[];
    toolRequirements: ToolRequirements[];
    buildingName: string;
    ownerUsername: string;
    claimEntityId: string;
    claimName: string;
    claimLocationX: number;
    claimLocationZ: number;
    totalActionsRequired: number;
    completed: boolean;
};

type Item = {
    id: number;
    name: string;
    iconAssetName: string;
    rarity: number;
    rarityStr: string;
    tier: number;
};

type Request = {
    craftResults: Craft[];
    items: Item[];
    cargos: Item[];
    claims: { entityId: string; name: string }[];
};

const colors = new Map<number, HexColorString>([
    [1, `#${"636a74"}`],
    [2, `#${"875f45"}`],
    [3, `#${"5c6f4d"}`],
    [4, `#${"49619c"}`],
    [5, `#${"814f87"}`],
    [6, `#${"983a44"}`],
    [7, `#${"947014"}`],
    [8, `#${"538484"}`],
    [9, `#${"464953"}`],
    [10, `#${"97afbf"}`],
]);

async function getCraftEmbed(
    craft: SharedCraft,
    tier: number,
    skills: LevelRequirements[],
) {
    const progress: number = craft.progress / craft.total;
    let profs: (Profession | null)[];
    let promises = skills.map(
        async (sk): Promise<Profession | null> =>
            await Profession.get({
                keys: "skill_id",
                values: sk.skill_id,
            }),
    );

    await Promise.all(promises)
        .then((res) => (profs = res))
        .catch((err) => {
            throw new Error(err);
        });

    let em: string | undefined;
    const sksf: string = skills
        .map((sk, i) => {
            const prof = profs[i];
            if (!prof) return null;
            if (!em) em = prof.emoji;
            return `${prof.p_name} nv. ${sk.level}`;
        })
        .filter((sk) => sk !== null)
        .join(", ");

    return new EmbedBuilder()
        .setTitle(shortenText(em + " " + craft.item_name, 256))
        .setDescription(
            `__**skill(s)**__: ${sksf}\n__**building**__: ${craft.crafting_station}`,
        )
        .setAuthor({
            name: shortenText(craft.owner_name ?? "author not found", 256),
        })
        .setFields([
            {
                name: `Progrès: ${Math.round(progress * 100)}%`,
                value:
                    `*${craft.progress} / ${craft.total}*\n` +
                    "⬜".repeat(Math.round(progress * 20)) +
                    "▫️".repeat(Math.round((1 - progress) * 20)),
            },
        ])
        .setColor(colors.get(tier) ?? null)
        .setFooter({ text: "Dernière update" })
        .setTimestamp();
}

async function update(_data: TaskData, config: Config) {
    const statuses = await SharedCraftsStatus.fetchArray();
    const chanManager: ChannelManager = config.bot.channels;

    for (const status of statuses) {
        const channel = await chanManager.fetch(status.channel_id);
        if (channel === null || channel.type !== ChannelType.GuildText)
            continue;

        const res = await fetch(
            `https://bitjita.com/api/crafts?claimEntityId=${status.claim_id}`,
            {
                method: "GET",
                headers: {
                    "User-Agent": "Notary - lebenet on discord",
                },
            },
        );
        const req: Request = await res.json();

        const existing: Map<string, SharedCraft> = new Map();
        (
            await SharedCraft.fetchArray({
                keys: "status_id",
                values: status.id,
            })
        ).forEach((sc) => existing.set(sc.entityId, sc));

        const items = new Map<number, Item>();
        req.cargos.forEach((c) => items.set(c.id, c));
        req.items.forEach((i) => items.set(i.id, i));

        let c: number = 0;
        const promises = req.craftResults.map(async (craft) => {
            let dbcraft: SharedCraft | undefined = existing.get(craft.entityId);
            let message: Message<true> | undefined;

            if (dbcraft !== undefined) {
                // update existing
                try {
                    message = await channel.messages.fetch(dbcraft.message_id);
                } catch {}

                // remove to mark as treated, remaining will be deleted (because completed)
                existing.delete(dbcraft.entityId);
            } else
                // create new
                dbcraft = new SharedCraft();

            // either new craft, or message got deleted
            /*
            if (message === undefined) {
                message = await channel.send(
                    "-# Awaiting update, please do not delete...",
                );
                dbcraft.message_id = message.id;
            } */

            // Transform request result to db craft
            dbcraft.entityId = craft.entityId;
            dbcraft.status_id = status.id;

            const item: Item | undefined = items.get(
                craft.craftedItem[0].item_id,
            );
            if (item)
                dbcraft.item_name = `${craft.craftCount > 1 ? `${craft.craftCount} ` : ""}${item.name} - T${item.tier} ${item.rarityStr}`;
            else dbcraft.item_name = "item not found";

            dbcraft.crafting_station = craft.buildingName;
            dbcraft.status = craft.completed ? "Completed" : "In Progress";
            dbcraft.claim_name = craft.claimName;
            dbcraft.progress = craft.progress;
            dbcraft.total = craft.totalActionsRequired;
            dbcraft.owner_name = craft.ownerUsername;

            const msg = {
                content: "",
                embeds: [
                    await getCraftEmbed(
                        dbcraft,
                        item?.tier ?? 1,
                        craft.levelRequirements,
                    ),
                ],
            };

            if (message) {
                if (dbcraft._inserted && !(await dbcraft.update())) return;
                else if (!dbcraft._inserted && !(await dbcraft.insert()))
                    return;
                message.edit(msg).catch();
                c++;
                return;
            }

            message = await channel.send(msg);
            dbcraft.message_id = message.id;

            if (
                (dbcraft._inserted && !(await dbcraft.update())) ||
                (!dbcraft._inserted && !(await dbcraft.insert()))
            ) {
                message.delete().catch();
                return;
            }
            c++;
        });

        await Promise.all(promises);
        console.log(
            `All crafts processed, ${c} / ${req.craftResults.length} passed`,
        );

        const ids: string[] = [
            ...existing.values().map((sc) => {
                sc.delete().catch();
                return sc.message_id;
            }),
        ];

        channel.bulkDelete(ids).catch();
    }
}

const data: TaskDataLoad = {
    name: "Update Shared Crafts for Claims",
    repeat: 0,
    autoStart: true,
    runOnStart: true,
    notResetOnReload: true,
    interval: 15,
};

module.exports = {
    data: data,
    run: update,
};
