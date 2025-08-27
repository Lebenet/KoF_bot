import { ChannelManager, ChannelType, EmbedBuilder, Message } from "discord.js";
import { SharedCraft, SharedCraftsStatus } from "../../db/dbTypes";
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

function getCraftEmbed(craft: SharedCraft) {
    const progress: number = craft.progress / craft.total;
    return new EmbedBuilder()
        .setTitle(shortenText(craft.item_name, 256))
        .setDescription(`__building__: **${craft.crafting_station}**`)
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
        .setFooter({ text: "Dernière update" })
        .setTimestamp();
}

async function update(_data: TaskData, config: Config) {
    const statuses = SharedCraftsStatus.fetchArray();
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
        SharedCraft.fetchArray({
            keys: "status_id",
            values: status.id,
        }).forEach((sc) => existing.set(sc.entityId, sc));

        const items: Map<number, Item> = new Map(
            req.items.map((i) => [i.id, i]),
        );

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
            if (message === undefined) {
                message = await channel.send(
                    "-# Awaiting update, please do not delete...",
                );
                dbcraft.message_id = message.id;
            }

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

            if (dbcraft._inserted) {
                if (!dbcraft.update()) return;
            } else {
                if (!dbcraft.insert()) return;
            }
            c++;

            message
                .edit({
                    //content: dbcraft.status,
                    content: "",
                    embeds: [getCraftEmbed(dbcraft)],
                    //components: [],
                })
                .catch();
        });

        await Promise.all(promises);
        console.log(
            `All crafts processed, ${c} / ${req.craftResults.length} passed`,
        );

        for (const completed of existing.values()) {
            console.log("deleting " + completed.item_name);
            channel.messages
                .fetch(completed.message_id)
                .then((msg) => msg.delete().catch())
                .catch();
            completed.delete();
        }
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
