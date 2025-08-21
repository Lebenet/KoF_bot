import {
    AutocompleteInteraction,
    ChannelType,
    ChatInputApplicationCommandData,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextChannel,
} from "discord.js";
import { Config } from "../../utils/configLoader";
import { Empire, LastUpdated, WatchtowerStatus } from "../../db/dbTypes";

type empire = {
    entityId: string;
    name: string;
    memberCount: string;
    leader: string;
};

type qRes = {
    empires: empire[];
};

async function setupWatchtowers(
    interaction: ChatInputCommandInteraction,
    config: Config,
) {
    if (!config.admins?.includes(interaction.user.id)) {
        await interaction.reply({
            content: "Not a bot admin !",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const empId: string = interaction.options.getString("empire", true);
    const chan: TextChannel = interaction.options.getChannel("channel", true, [
        ChannelType.GuildText,
    ]);
    const del: boolean = interaction.options.getBoolean("del") || false;

    const emp = Empire.get({ keys: "entityId", values: empId });
    if (!emp) {
        await interaction.editReply("Empire not found !");
        return;
    }

    if (del) {
        const ws = WatchtowerStatus.get({
            keys: ["guild_id", "channel_id", "empire_id"],
            values: [interaction.guildId!, chan.id, empId],
        });
        if (!ws) {
            await interaction.editReply("Param not found !");
            return;
        }
        if (!ws.delete()) {
            await interaction.editReply("Failed to delete !");
            return;
        }
        await interaction.editReply(
            `Param deleted. Please delete the associated message https://discord.com/channels/${ws.guild_id}/${ws.channel_id}/${ws.message_id}.`,
        );
        return;
    }

    const ws = new WatchtowerStatus();
    ws.guild_id = interaction.guildId!;
    ws.channel_id = chan.id;
    ws.empire_id = empId;

    const msg = await chan.send({
        content: "test",
    });
    ws.message_id = msg.id;

    if (!ws.insert()) {
        await interaction.editReply("Failed to add!");
        return;
    }

    await interaction.editReply("Done.");
    setTimeout(() => interaction.deleteReply().catch(), 5_000);
}

async function getEmpires(curr: string): Promise<Empire[]> {
    console.log("getting empires +++", curr);

    const lu = new LastUpdated();
    lu.table_name = "Empires";
    if (!lu.sync()) lu.last_updated = new Date(0);

    if (lu.last_updated.getTime() + 60_000 * 60_000 < Date.now()) {
        console.time("fetching empires");
        const resRaw = await fetch(`https://bitjita.com/api/empires`, {
            method: "GET",
            headers: {
                "User-Agent": "Notary - lebenet on discord",
            },
        });
        const res: qRes = await resRaw.json();
        res.empires.forEach((e: empire) => {
            const emp = new Empire();
            emp.entityId = e.entityId;
            emp.sync();
            emp.e_name = e.name;
            emp.memberCount = e.memberCount;
            emp.leader = e.leader;
            if (emp._inserted) emp.update();
            else emp.insert();
        });
        lu.last_updated = new Date();
        if (lu._inserted) lu.update();
        else lu.insert();
        console.timeEnd("fetching empires");
    }

    return Empire.fetchArray({
        keys: "e_name",
        values: `LIKE %${curr}%`,
        limit: 10,
    });
}

async function autocomplete(
    interaction: AutocompleteInteraction,
    config: Config,
) {
    if (!config.admins?.includes(interaction.user.id)) {
        await interaction.respond([
            { name: "Not a bot admin !", value: "" }, //s
        ]);
        return;
    }

    const curr: string = interaction.options.getFocused();
    const vals = await getEmpires(curr);
    await interaction.respond(
        vals.map((e) => {
            return {
                name: `${e.e_name}, owned by ${e.leader} (${e.memberCount} members)`,
                value: e.entityId,
            };
        }),
    );
}

module.exports = {
    data: () =>
        new SlashCommandBuilder()
            .setName("setup_watchtowers")
            .setDescription("Choose where to display an updated summary")
            .addStringOption((option) =>
                option
                    .setName("empire")
                    .setDescription("Choose the empire (powered by BitJita)")
                    .setAutocomplete(true)
                    .setRequired(true),
            )
            .addChannelOption((option) =>
                option
                    .setName("channel")
                    .setDescription("Channel to send the watchtowers report to")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText),
            )
            .addBooleanOption((option) =>
                option
                    .setName("del")
                    .setDescription("Remove if true")
                    .setRequired(false),
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    execute: setupWatchtowers,

    autocomplete: autocomplete,
};
