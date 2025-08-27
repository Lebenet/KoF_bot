import {
    AutocompleteInteraction,
    ChannelType,
    ChatInputCommandInteraction,
    MessageFlags,
    PermissionFlagsBits,
    SlashCommandBuilder,
    TextChannel,
} from "discord.js";
import { Config } from "../../utils/configLoader";
import { SharedCraftsStatus } from "../../db/dbTypes";
import { shortenText } from "../../utils/discordUtils";

type Claim = {
    entityId: string;
    ownerPlayerEntityId: string;
    ownerBuildingEntityId: string;
    name: string;
    neutral: boolean;
    regionId: number;
    regionName: string;
    createdAt: string; // date
    updatedAt: string; // date
    supplies: number;
    buildingMaintenance: number;
    numTiles: number;
    locationx: number;
    locationZ: number;
    locationDimension: number;
    treasury: string;
    learned: number[];
    researching: number;
    startTimestamp: string | null; // date
    tier: number;
};

type Request = {
    claims: Claim[];
    count: string;
};

async function setupCrafts(
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

    const [claimId, claimName] = interaction.options
        .getString("claim", true)
        .split("|");
    const chan: TextChannel = interaction.options.getChannel("channel", true, [
        ChannelType.GuildText,
    ]);
    const del: boolean = interaction.options.getBoolean("del") ?? false;

    let setup: SharedCraftsStatus | null = SharedCraftsStatus.get({
        keys: ["guild_id", "channel_id", "claim_id"],
        values: [interaction.guildId, chan.id, claimId],
    });

    if (setup !== null) {
        if (del) {
            if (!setup.delete()) {
                await interaction.editReply(
                    "Failed to delete, please try again !",
                );
                return;
            }

            await interaction.editReply("Succesfully deleted.");
            setTimeout(() => interaction.deleteReply().catch(), 5_000);
            return;
        }

        await interaction.editReply(
            "Already set up for this channel and claim in this server !",
        );
        return;
    }

    setup = new SharedCraftsStatus();
    setup.guild_id = interaction.guildId!;
    setup.channel_id = chan.id;
    setup.claim_id = claimId;

    if (!setup.insert()) {
        await interaction.editReply("Failed to setup, DB error !");
        return;
    }

    // IDEA: add a button to unsubscribe, and pin this message
    await chan.send({
        content: `Ce salon a été setup pour suivre les crafts partagés du claim **${claimName}**.\nUpdate automatiquement toutes les 15 minutes.`,
        embeds: [],
        components: [],
    });
    await interaction.editReply(`**Succesfull** ! See <#${chan.id}>.`);
}

async function autocomplete(
    interaction: AutocompleteInteraction,
    config: Config,
) {
    if (!config.admins?.includes(interaction.user.id)) {
        await interaction.respond([
            { name: "Not a bot admin !", value: "error" },
        ]);
        return;
    }

    const curr = interaction.options.getFocused();
    const res = await fetch(`https://bitjita.com/api/claims?q=${curr}&page=1`, {
        method: "GET",
        headers: {
            "User-Agent": "Notary - lebenet on discord",
        },
    });
    const req: Request = await res.json();

    if (Number(req.count) > 10) req.claims = req.claims.slice(0, 10);
    await interaction.respond(
        req.claims.map((c: Claim) => {
            return {
                name: `${c.name} - T${c.tier}, Region ${c.regionId} (${c.regionName})`,
                value: shortenText(`${c.entityId}|${c.name}`, 100),
            };
        }),
    );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("setup_crafts")
        .setDescription(
            "Choose a channel to display current open crafts in a claim",
        )
        .addStringOption((option) =>
            option
                .setName("claim")
                .setDescription("Name of the claim to target")
                .setAutocomplete(true)
                .setRequired(true),
        )
        .addChannelOption((option) =>
            option
                .setName("channel")
                .setDescription("Channel to display it to")
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true),
        )
        .addBooleanOption((option) =>
            option
                .setName("del")
                .setDescription("whether to delete or not")
                .setRequired(false),
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    execute: setupCrafts,
    autocomplete: autocomplete,
};
