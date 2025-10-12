import {
    ActionRowBuilder,
    APIApplicationCommandOptionChoice,
    AutocompleteInteraction,
    ButtonBuilder,
    ButtonStyle,
    ChatInputCommandInteraction,
    Colors,
    CommandInteraction,
    EmbedBuilder,
    ForumChannel,
    MessageActionRowComponentBuilder,
    MessageFlags,
    SlashCommandBuilder,
    TextChannel,
    ThreadAutoArchiveDuration,
    ThreadChannel,
    UserSelectMenuBuilder,
} from "discord.js";
import { Config } from "../../utils/configLoader";
import {
    primaryEmbed,
    shortenMessage,
    shortenText,
    shortenTitle,
} from "../../utils/discordUtils";
import {
    ChannelParam,
    Command,
    CommandAssignee,
    CommandItem,
    CommandProfession,
    Settlement,
} from "../../db/dbTypes";

interface Item {
    id: number;
    name: string;
    description: string;
    volume: number;
    secondaryKnowledgeId: number;
    tier: number;
    tag: string;
    rarity: string;
    compendiumEntry: boolean;
    itemListId: number;
}

interface Req {
    count: number;
    data: Item[];
}

const items: Item[] = [];

fetch("https://api.bitcraftonline.ru/items")
    .then((res) => res.json())
    .then((data: Req) => {
        items.push(...data.data);
    })
    .catch((err) => {
        throw err;
    });

function getPanelEmbed(command: Command): EmbedBuilder {
    const items = CommandItem.fetchArray({
        keys: "command_id",
        values: command.id,
    })
        .toSorted(
            (i1, i2) => i2.quantity - i2.progress - (i1.quantity - i1.progress),
        )
        .map((i) => {
            const nameLim = shortenText(i.item_name, 40);
            return i.progress >= i.quantity
                ? `- ✅ ~~*[${Math.min(i.progress, i.quantity)}/${i.quantity}] - **${nameLim}***~~`
                : `- ${`**__${i.quantity - i.progress}__**`} [${Math.min(i.progress, i.quantity)}/${i.quantity}] - **${nameLim}**`;
        });

    const rows = new Array<{ name: string; value: string; inline: false }>();
    let i = 0;
    while (i < items.length && rows.length < 4) {
        if (items.length - i >= 9) {
            rows.push({
                name: i === 0 ? "Items:" : "\u200e",
                value: items.slice(i, i + 9).join("\n"),
                inline: false,
            });
            i += 9;
        } else {
            rows.push({
                name: i === 0 ? "Items:" : "\u200e",
                value: items.slice(i, i + (items.length - i)).join("\n"),
                inline: false,
            });
            i = items.length;
        }
    }
    if (rows.length === 0)
        rows.push({ name: "Items", value: "Pas précisé.", inline: false });

    const desc = shortenText(command.description, 1000);
    const title = shortenTitle(command.c_name);

    const ret = new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(Colors.DarkAqua)
        .setFooter({ text: "Dernière update:" })
        .setTimestamp();

    if (command.settlement_id) {
        const setl = new Settlement();
        setl.id = command.settlement_id;
        ret.addFields([
            {
                name: "Claim",
                value: setl.sync() ? setl.s_name : "Erreur",
                inline: false,
            },
        ]);
    }

    ret.addFields([
        { name: "Coffre de dépôt:", value: command.chest, inline: true },
        {
            name: "Matériaux fournis:",
            value: command.self_supplied ? "Oui." : "Non.",
            inline: true,
        },
        {
            name: "Professions:",
            value:
                CommandProfession.fetchArray({
                    keys: "command_id",
                    values: command.id,
                })
                    .map((p) => p.profession_name)
                    .join(", ") || "Pas précisé.",
        },
        ...rows,
        {
            name: "Assignés",
            value: CommandAssignee.fetchArray({
                keys: "command_id",
                values: command.id,
            })
                .map((a) => `<@${a.user_id}>`)
                .join(", "),
        },
    ]);

    return ret;
}

async function execute(
    interaction: ChatInputCommandInteraction,
    config: Config,
) {
    // Options
    const itemName = interaction.options.getString("item", true);
    let qty: number;
    let setlId: number | null;

    try {
        qty = Number(interaction.options.getString("quantity") ?? "1");
        if (qty <= 0) {
            await interaction.reply({
                content: "La quantité doit être au moins 1.",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        setlId = interaction.options.getString("claim")
            ? Number(interaction.options.getString("claim"))
            : null;
    } catch {
        await interaction.reply({
            content: "Erreur dans les options.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Rest
    const guildId = interaction.guildId ?? "0";

    // From DB
    // Check that it is a correct claim
    let setl: Settlement | null = null;
    if (setlId) setl = Settlement.get({ keys: "id", values: setlId });
    if (!setl && setlId) {
        await interaction.reply({
            content: "Claim pas trouvé !",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Check that the user isn't already prepping a command in that claim
    let tryCmd: Command | null;
    if (
        (tryCmd = Command.get({
            keys: ["author_id", "guild_id", "settlement_id"],
            values: [interaction.user.id, guildId, setlId],
        })) &&
        tryCmd.status !== "Ready"
    ) {
        await interaction.reply({
            content:
                "Tu as déjà une création de commande en cours " +
                (setl ? `pour le claim **${setl.s_name}**` : "") +
                " (" +
                `<#${tryCmd.thread_id}>` +
                "). Confirme ou annule ta premiere commande pour en faire une nouvelle.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const chan = ChannelParam.getParam(
        guildId,
        "commander",
        "commandes_channel_id",
        setl?.id ?? null,
    );
    const ppanel = ChannelParam.getParam(
        guildId,
        "commander",
        "panel_channel_id",
        setl?.id ?? null,
    );

    if (!chan || !ppanel) {
        await interaction.editReply(
            "Cette commande n'a pas encore été __setup__" +
                (setl
                    ? ` pour le claim **${setl.s_name}**. `
                    : `.\n-# *rappel: \`/item_request claim:<nom_du_claim>\` pour faire commande pour un claim spécifique.*\n`),
        );
        return;
    }

    // Get host channel
    const channel = (await config.bot.channels.fetch(chan.channel_id)) as
        | TextChannel
        | ForumChannel;
    if (!channel) {
        await interaction.reply({
            content:
                "Le salon de commandes a été supprimé! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Additional command variables
    const c_name: string = `${qty > 1 ? `${qty} ` : ""}${itemName}`;
    const chest: string = `Voir avec <@${interaction.user.id}>.`;
    const self_supplied: boolean = false;
    const description: string = `Commande de ${c_name} créée par <@${interaction.user.id}>.`;
    const status: string = "Ready";

    const title: string = shortenTitle(c_name);
    const descLim: string = shortenMessage(description);

    // Order thread
    const thread = await channel.threads.create({
        name: title,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Create thread for material order.`,
        message: {
            content: `\u200e${descLim}`,
        },
    });

    // Create command in DB
    const cmd = new Command();
    cmd.guild_id = guildId;
    cmd.settlement_id = setl?.id ?? null;
    cmd.thread_id = thread.id;
    // cmd.message_id =
    // cmd.panel_message_id =
    cmd.c_name = c_name;
    cmd.chest = chest;
    cmd.description = descLim;
    cmd.self_supplied = self_supplied;
    cmd.author_id = interaction.user.id;
    cmd.status = status;

    if (!cmd.insert()?.sync()) {
        await thread.delete();
        await interaction.editReply(
            `Votre commande **${c_name}** n'a pas pu être créée (insert failed). Veuillez réessayer.`,
        );
        return;
    }

    // Claim button
    const claimBut = new ButtonBuilder()
        .setCustomId(`${interaction.guildId}|commander|claimHandler|${cmd.id}`)
        .setLabel("Auto-assigner")
        .setEmoji({ name: "✋" })
        .setStyle(ButtonStyle.Secondary);

    // Cancel/Complete order button (remove from panel)
    const closeBut = new ButtonBuilder()
        .setCustomId(`|commander|closeHandler|${cmd.id}`)
        .setLabel("Fermer")
        .setStyle(ButtonStyle.Danger);

    // To add items
    const addItemsBut = new ButtonBuilder()
        .setCustomId(`|commander|addItemsSend|${cmd.id}`)
        .setLabel("Ajouter Items")
        .setStyle(ButtonStyle.Secondary);

    // Components rows
    const row1 =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            claimBut,
            closeBut,
        );
    const row2 =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            addItemsBut,
        );

    // Construct embed
    const embed = new EmbedBuilder()
        .setColor(Colors.DarkGreen)
        .setTitle(title)
        .setAuthor({
            name: interaction.user.displayName,
            iconURL: interaction.user.avatarURL()!,
        })
        .setDescription(descLim)
        .setFooter({
            text: "WIP. Contact `lebenet` for requests.",
            iconURL: config.bot.user!.avatarURL()!,
        })
        .setTimestamp()
        .addFields(
            {
                name: "**Coffre:**",
                value: cmd.chest,
            },
            {
                name: "**Matériaux fournis:**",
                value: "Non.",
            },
        );

    // Send message
    const msg = await thread.send({
        embeds: [embed],
        components: [row1, row2],
    });
    msg.pin().catch();

    // Fail-safe
    cmd.message_id = msg.id;
    if (!cmd.update()) {
        await thread.delete();
        cmd.delete();
        await interaction.editReply(
            `Votre commande **${c_name}** n'a pas pu être créée (update failed). Veuillez réessayer.`,
        );
        return;
    }

    // Add item to command
    const item = new CommandItem();
    item.command_id = cmd.id;
    item.item_name = itemName;
    item.quantity = qty;
    item.progress = 0;

    if (!item.insert()?.sync()) {
        await interaction.editReply(
            `Votre commande **${c_name}** n'a pas pu être créée (item insert failed). Veuillez réessayer.`,
        );
        cmd.delete();
        await thread.delete();
        return;
    }

    // Send item progress to thread
    // Create components
    const advanceBut = new ButtonBuilder()
        .setCustomId(`|commander|advanceItemSend|${cmd.id}|${item.id}`)
        .setLabel("Avancer")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary);

    const completeBut = new ButtonBuilder()
        .setCustomId(`|commander|completeItemHandler|${cmd.id}|${item.id}`)
        .setLabel("Compléter")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

    const imsg = await thread.send({
        content: shortenMessage(
            `### 🔃 [0/${item.quantity}] - ${item.item_name}`,
        ),
        components: [
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                [advanceBut, completeBut],
            ),
        ],
    });

    item.message_id = imsg.id;
    if (!item.update()) {
        await imsg.delete();
        item.delete();
    } else await imsg.pin();

    // Get panel channel
    const panel = (await config.bot.channels.fetch(ppanel.channel_id)) as
        | TextChannel
        | undefined;
    if (!panel) {
        interaction
            .editReply(
                "Le salon panels n'a pas été défini! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
            )
            .catch(console.log);
        cmd.delete();
        (interaction.channel as ThreadChannel).delete();
        return;
    }

    // Build panel embed
    const pembed = getPanelEmbed(cmd);

    // Assign provider panel
    const assignMenu = new UserSelectMenuBuilder()
        .setCustomId(`${interaction.guildId}|commander|assignHandler|${cmd.id}`)
        .setPlaceholder("Assigner")
        .setMaxValues(10);

    const panelRow1 =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
            claimBut,
        );
    const panelRow2 =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
            assignMenu,
        );

    const panelMsg = await panel.send({
        content: "Nouvelle commande !",
        embeds: [pembed],
        components: [panelRow1, panelRow2],
    });

    cmd.panel_message_id = panelMsg.id;
    cmd.status = "Ready";
    if (!cmd.update()) {
        interaction
            .editReply("Erreur de database! L'interaction a échouée.")
            .catch(console.log);
        await panelMsg.delete();
        return;
    }

    // Success message
    await interaction.editReply(
        `Votre commande est __prête__ dans **<#${thread.id}>** !`,
    );
    setTimeout(() => interaction.deleteReply().catch(), 15_000);
}

async function autocomplete(
    interaction: AutocompleteInteraction,
    _config: Config,
) {
    const focusedOption = interaction.options.getFocused(true);

    let choices: { name: string; value: string }[] = [];
    if (focusedOption.name === "claim") {
        const guildId = interaction.guildId ?? "0";
        choices = Settlement.fetchArray({
            keys: "guild_id",
            values: guildId,
        }).map((s) => ({ name: s.s_name, value: `${s.id}` }));
    } else if (focusedOption.name === "item")
        choices = items
            .filter((item) =>
                item.name
                    .toLowerCase()
                    .includes(focusedOption.value.toLowerCase()),
            )
            .slice(0, 25)
            .map((item) => {
                const name = `${item.name.replace(/T\d+\s+/, "")} - ${item.tier >= 0 ? `T${item.tier} ` : ""}${item.rarity}`;
                return { name: name, value: name };
            });

    await interaction.respond(choices);
}

const data = new SlashCommandBuilder()
    .setName("item_request")
    .setDescription("Request an item for development purposes.")
    .addStringOption((option) =>
        option
            .setName("item")
            .setDescription("Nom de l'item")
            .setRequired(true)
            .setAutocomplete(true),
    )
    .addStringOption((option) =>
        option
            .setName("quantity")
            .setDescription("Quantité suohaitée (1 par défaut)")
            .setRequired(false),
    )
    .addStringOption((option) =>
        option
            .setName("claim")
            .setDescription("Nom du claim (global par défaut)")
            .setRequired(false)
            .setAutocomplete(true),
    );

module.exports = {
    data: data,
    execute: execute,
    autocomplete: autocomplete,
    help: primaryEmbed({
        title: "Item Request | Aide",
        description:
            "Cette commande sert à créer une commande (ref. `/commander`) rapidement pour 1 seul item.\n" +
            "Contrairement à `/commander`, `/item_request` permet de directement créer une commande prête.",
        fields: [
            {
                name: "Utilisation",
                value:
                    "`/item_request item:<nom de l'item>` quantity:<quantité>\n" +
                    "**Exemple**: `/item_request item: quantity:10`",
            },
        ],
    }),
};
