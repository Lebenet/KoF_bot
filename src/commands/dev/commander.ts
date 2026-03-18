import {
    SlashCommandBuilder,
    MessageFlags,
    EmbedBuilder,
    ModalBuilder,
    ButtonBuilder,
    ModalSubmitInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    StringSelectMenuBuilder,
    StringSelectMenuInteraction,
    ActionRowBuilder,
    ModalActionRowComponentBuilder,
    TextInputBuilder,
    TextInputStyle,
    ThreadAutoArchiveDuration,
    ThreadChannel,
    TextChannel,
    ForumChannel,
    Colors,
    ButtonStyle,
    MessageActionRowComponentBuilder,
    MessageActionRowComponent,
    APIEmbed,
    ComponentType,
    ActionRow,
    ButtonComponent,
    UserSelectMenuBuilder,
    UserSelectMenuInteraction,
    Message,
    MessageType,
    TextThreadChannel,
    ForumThreadChannel,
    Attachment,
    Snowflake,
    GuildForumTag,
    BaseMessageOptions,
} from "discord.js";

import { Config } from "../../utils/configLoader";

import {
    Command,
    CommandItem,
    CommandProfession,
    CommandAssignee,
    ChannelParam,
    User,
    Fournisseur,
    Settlement,
    ProfessionLink,
    CommandItemsProgression,
    CommandContribution,
} from "../../db/dbTypes";

import {
    getProfessionsStringSelectMessageComp,
    getSettlementsHelper,
    primaryEmbed,
    shortenMessage,
    shortenText,
    shortenTitle,
} from "../../utils/discordUtils";
import fs from "fs";
import path from "path";

function generateShortId(): string {
    return Math.random().toString(36).substring(2, 6);
}

// Global map storing CSV file URIs temporarily
const tempCsvFiles: Map<string, { url: string; name: string }> = new Map();

function getCommandButtons(
    command: Command,
): ActionRowBuilder<MessageActionRowComponentBuilder>[] {
    // Ready button, disabled if status is "Profs"
    const readyBut = new ButtonBuilder()
        .setCustomId(`|commander|readyHandler|${command.id}`)
        .setLabel("Confirmer")
        .setStyle(ButtonStyle.Success)
        .setDisabled(command.status === "Profs");

    // Claim button
    const claimBut = new ButtonBuilder()
        .setCustomId(`${command.guildId}|commander|claimHandler|${command.id}`)
        .setLabel("Auto-assigner")
        .setEmoji({ name: "✋" })
        .setStyle(ButtonStyle.Secondary);

    // Cancel/Complete order button (remove from panel)
    const closeBut = new ButtonBuilder()
        .setCustomId(`|commander|closeHandler|${command.id}`)
        .setLabel("Fermer")
        .setStyle(ButtonStyle.Danger);

    // To add items
    const addItemsBut = new ButtonBuilder()
        .setCustomId(`|commander|addItemsSend|${command.id}`)
        .setLabel("Ajouter Items")
        .setStyle(ButtonStyle.Secondary);

    // To ping professions
    const pingBut = new ButtonBuilder()
        .setCustomId(`|commander|pingProfsHandler|${command.id}`)
        .setLabel(command.ping ? "Désactiver ping" : "Activer ping")
        .setStyle(ButtonStyle.Secondary);

    const row1: ActionRowBuilder<MessageActionRowComponentBuilder> =
        new ActionRowBuilder<MessageActionRowComponentBuilder>();
    if (command.status !== "Ready") {
        row1.addComponents(readyBut, closeBut);
    } else {
        row1.addComponents(claimBut, closeBut);
    }

    const row2 =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            addItemsBut,
        );
    if (command.status !== "Ready") {
        row2.addComponents(pingBut);
    }

    // Only add 'Profs' row if status is "Profs"
    if (command.status !== "Profs") return [row1, row2];

    // Profession select menu
    const opts = getProfessionsStringSelectMessageComp();
    const profs = new StringSelectMenuBuilder()
        .setCustomId(`|commander|manageProfessionsHandler|${command.id}`)
        .setPlaceholder("Métiers")
        .addOptions(opts)
        .setMaxValues(opts.length);

    const row3 =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            profs,
        );

    return [row1, row2, row3];
}

// TODO: for temporary reports, add a unique identifier to avoid conflicts on the same command
function generateCommandReport(
    command: Command,
    timeout: number = 300,
): string {
    // For now, generate them in the /dist directory
    const dirPath: string = path.parse(`/usr/bot/dist/tmp/commander/${command.id}/`).dir;
    const filePath: string = path.join(dirPath, "report.txt");
    // this is just to make sure
    fs.mkdirSync(dirPath, {
        recursive: true,
    });
    fs.writeFileSync(filePath, "");
    // Report header
    const itemsStr: string = CommandItem.fetchArray({
        keys: "command_id",
        values: command.id,
    })
        .map((item) => `\t- ${item.toString(true)}`)
        .join("\n");
    fs.appendFileSync(
        filePath,
        `=== Close Report for command (${command.id}) ${command.c_name} ===\n\n` +
            `\tDescription: '${command.description}'\n` +
            `\tDestination chest: '${command.chest ?? "unspecified"}'\n` +
            `\tItems:\n` +
            (itemsStr.length > 0 ? itemsStr : "\t- No items specified") +
            "\n\n-==== Actions History: ====-\n\n",
    );

    // Write user action report, in timestamp ascending order
    fs.appendFileSync(
        filePath,
        CommandContribution.fetchArray({
            keys: "command_id",
            values: command.id,
        })
            .sort(
                (a, b) =>
                    a.timestamp.getMilliseconds() -
                    b.timestamp.getMilliseconds(),
            )
            .map(
                (log) =>
                    `[${log.timestamp}]: ${User.get({ keys: "id", values: log.user_id })?.username ?? "Unknown user"} (${log.user_id}): ${log.action}`,
            )
            .join("\n") + "\n",
    );

    // Delete report after timeout (defaults to 5 mins) if > 0
    if (timeout > 0)
        setTimeout(() => {
            fs.rm(filePath, { force: true }, (err) => {
                if (err != null)
                    console.error(
                        `Failed to delete temporary report file '${filePath}': ${err}`,
                    );
                else console.log(`Deleting temporary report file '${filePath}'...`);
            });
        }, timeout * 1000);

    // Return path to log file
    return filePath;
}

async function order(
    interaction: ChatInputCommandInteraction,
    _config: Config,
) {
    // Guild ID from interaction
    const guildId = interaction.guild?.id ?? interaction.guildId ?? "0";

    // Claim ID (?) from interaction options
    const claimId = interaction.options.getString("claim");

    // Check that it is a correct claim
    let setl: Settlement | null = null;
    if (claimId) setl = Settlement.get({ keys: "id", values: claimId });
    if (!setl && claimId) {
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
            values: [interaction.user.id, guildId, claimId || null],
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

    const chan = ChannelParam.getParam(
        guildId,
        "commander",
        "commandes_channel_id",
        setl?.id ?? null,
    );
    const panel = ChannelParam.getParam(
        guildId,
        "commander",
        "panel_channel_id",
        setl?.id ?? null,
    );

    if (!chan || !panel) {
        await interaction.reply({
            content:
                "Cette commande n'a pas encore été __setup__" +
                (setl
                    ? ` pour le claim **${setl.s_name}**. `
                    : `.\n-# *rappel: \`/commander claim:<nom_du_claim>\` pour faire commande pour un claim spécifique.*\n`),
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Get optional file attachment
    const attachment: Attachment | null =
        interaction.options.getAttachment("fichier_csv");
    let attachmentId = "";
    if (attachment) {
        // Check that it is a CSV file
        if (!attachment.name?.toLowerCase().endsWith(".csv")) {
            await interaction.reply({
                content: "Le fichier doit être un .CSV !",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        // Generate unique short id
        let id: string = generateShortId();
        while (tempCsvFiles.has(id)) {
            id = generateShortId();
        }

        // Add it to the map
        tempCsvFiles.set(id, { url: attachment.url, name: attachment.name });
        console.log("[INFO] Stored temporary CSV file with id:", id);
        console.log("[INFO] URL:", attachment.url);
        console.log("[INFO] Name:", attachment.name);
        attachmentId = id;
    }

    // Create the modal sent to the user
    const initModal = new ModalBuilder()
        .setCustomId(
            `${guildId}|commander|initHandler|${setl?.id ?? -1}${attachment ? `|${attachmentId}` : ""}`,
        )
        .setTitle("Détails de la commande")
        .addComponents(
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("c_name")
                    .setLabel("Nom de la commande")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(255),
            ),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("chest")
                    .setLabel("Coffre de dépot?")
                    .setPlaceholder("(optionel)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(255),
            ),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("self_supplied")
                    .setLabel("Je fournis les matériaux?")
                    .setPlaceholder("(ne pas remplir si non)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(10),
            ),
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("description")
                    .setLabel("Courte description de la commande ")
                    .setPlaceholder("(optionel)")
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setMaxLength(3999),
            ),
        );

    interaction.showModal(initModal);
}

async function initHandler(
    interaction: ModalSubmitInteraction,
    config: Config,
) {
    // What follows depends also on userId
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const customIdParts: string[] = interaction.customId.split("|");
    const guildId = customIdParts[0];
    const setlId = Number(customIdParts[3]);

    // retrieve optional attachment
    const attachmentId = customIdParts.length > 4 ? customIdParts[4] : null;
    let attachment: { url: string; name: string } | null = null;
    if (attachmentId && tempCsvFiles.has(attachmentId)) {
        attachment = tempCsvFiles.get(attachmentId)!;
        // Remove from map after retrieving
        tempCsvFiles.delete(attachmentId);
    }

    const chan = ChannelParam.getParam(
        guildId,
        "commander",
        "commandes_channel_id",
        setlId > 0 ? setlId : undefined,
    );
    if (!chan) {
        await interaction.reply({
            content:
                "Le salon de commandes n'a pas été setup! Un admin doit faire `/setup_commandes` d'abord.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const c_name: string = interaction.fields.getTextInputValue("c_name");
    const chest: string = interaction.fields.getTextInputValue("chest");
    const self_supplied: boolean =
        interaction.fields.getTextInputValue("self_supplied") !== "";
    const description: string =
        interaction.fields.getTextInputValue("description");

    const title = shortenTitle(c_name);
    const descLim = shortenMessage(description);

    // Order thread
    const thread = await channel.threads.create({
        name: title,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Create thread for material order.`,
        message: {
            content: `\u200e${descLim}`,
        },
    });

    const command: Command = new Command();
    command.guild_id = interaction.guildId!;
    command.thread_id = thread.id;
    command.c_name = c_name;
    if (chest) command.chest = chest;
    if (description) command.description = description;
    if (setlId !== -1) command.settlement_id = setlId;
    else command.settlement_id = null;
    command.self_supplied = self_supplied;
    command.author_id = interaction.user.id;
    command.status = attachment === null ? "Profs" : "Building";

    if (!command.insert()?.sync()) {
        await thread.delete();
        await interaction.editReply(
            `Votre commande **${c_name}** n'a pas pu être créée (insert failed). Veuillez réessayer.`,
        );
        return;
    } else {
        thread.members.add(interaction.user.id);
        await thread.join();

        // Order embed
        const desc = shortenText(command.description, 1000);

        const message = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(title)
            .setAuthor({
                name: interaction.user.displayName,
                iconURL: interaction.user.avatarURL()!,
            })
            .setDescription(desc)
            .setFooter({
                text: "WIP. Contact `lebenet` for requests.",
                iconURL: config.bot.user!.avatarURL()!,
            })
            .setTimestamp()
            .addFields(
                {
                    name: "**Coffre:**",
                    value: command.chest,
                },
                {
                    name: "**Matériaux fournis:**",
                    value: command.self_supplied
                        ? "- Par le créateur de la commande."
                        : "Non.",
                },
            );

        let itemList: CommandItem[] = [];
        let professionsSet: Set<string> = new Set();
        // handle file attachment or not
        if (attachment) {
            // Parse CSV file and add items to the command
            const response = await fetch(attachment.url);

            // Check error case
            if (!response.ok) {
                await thread.delete();
                command.delete();
                await interaction.editReply(
                    `Votre commande **${c_name}** n'a pas pu être créée (fichier inaccessible). Veuillez réessayer.`,
                );
                return;
            }

            // retrieve text and parse it line by line
            const lines = (await response.text()).split(/\r?\n/);

            // 1 to skip header
            for (let i = 1; i < lines.length; i++) {
                const line: string = lines[i];

                // get components
                const regex = /"([^"]*)","([^"]*)","([^"]*)","([^"]*)"/;
                const parts = line.match(regex);
                if (!parts || parts.length < 5) {
                    continue; // skip malformed lines
                }

                const itemName: string = `T${parts[3]} ${parts[1]}`;
                const qty: number = Number(parts[2]);
                const profession: string = parts[4];

                // Insert them in list
                const item = new CommandItem();
                item.command_id = command.id;
                item.item_name = itemName;
                item.quantity = qty;
                if (!item.insert()) {
                    try {
                        await thread.send(
                            `Erreur lors de l'ajout de l'item **${itemName}** *(x${qty})*.`,
                        );
                    } catch {}
                } else {
                    itemList.push(item);
                    professionsSet.add(profession);
                }
            }

            // Add professions to embed
            message.addFields({
                name: "Professions:",
                value: Array.from(professionsSet).join(", "),
            });

            // Add them to the command as CommandProfession
            for (const profName of professionsSet) {
                const prof = new CommandProfession();
                prof.command_id = command.id;
                prof.profession_name = profName;
                prof.filled = false;
                if (!prof.insert()) {
                    try {
                        await thread.send(
                            `Erreur lors de l'ajout du métier **${profName}** aux tags du thread.`,
                        );
                    } catch {}
                }
            }
        } else {
            message.addFields(
                // Empty line
                { name: "\u200e", value: "\u200e" },
                {
                    name: "**Informations**",
                    value: "**Merci de sélectionner les professions correspondant à votre commande, afin de simplifier le travail des coordinateurs.**",
                },
            );
        }

        // Buttons
        const components = getCommandButtons(command);

        const msg = await thread.send({
            embeds: [message],
            components,
        });

        await msg.pin().catch(() => {});

        command.message_id = msg.id;
        if (!command.update()) {
            await thread.delete();
            command.delete();
            await interaction.editReply(
                `Votre commande **${c_name}** n'a pas pu être créée (update failed). Veuillez réessayer.`,
            );
            return;
        }

        let pinsList: string[] = [];
        // Message collector to remove pins notification
        const collector = thread.createMessageCollector({
            time: 3600_000, // 1 hour (for big commands)
            filter: (m) => m.type === MessageType.ChannelPinnedMessage,
        });
        collector.on("collect", (m) => {
            pinsList.push(m.id);
            // console.log("[INFO] Collected pin message:", m.id);
            // console.log("[INFO] Total pin messages to delete:", pinsList.length);
        });

        // Send items list to thread asycnhronously
        // Create tasks and await them all at once
        const sendTasks: Promise<void>[] = [];
        for (const item of itemList) {
            sendTasks.push(
                (async (item: CommandItem) => {
                    // Create components
                    const advanceBut = new ButtonBuilder()
                        .setCustomId(
                            `|commander|advanceItemSend|${command.id}|${item.id}`,
                        )
                        .setLabel("Avancer")
                        .setEmoji("➕")
                        .setStyle(ButtonStyle.Secondary);

                    const completeBut = new ButtonBuilder()
                        .setCustomId(
                            `|commander|completeItemHandler|${command.id}|${item.id}`,
                        )
                        .setLabel("Compléter")
                        .setEmoji("✅")
                        .setStyle(ButtonStyle.Success);

                    // Create message
                    let msg: Message | null = null;
                    try {
                        msg = await thread.send({
                            content: shortenMessage(
                                `### 🔃 [0/${item.quantity}] - ${item.item_name}`,
                            ),
                            components: [
                                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                                    [advanceBut, completeBut],
                                ),
                            ],
                        });
                    } catch {}

                    if (msg == null) {
                        item.delete();
                        thread
                            .send(
                                `L'item **${item.item_name}** n'a pas pu être créé (message send failed). Veuillez réessayer.`,
                            )
                            .catch(() => {});
                        return;
                    }

                    // Send and pin message
                    item.message_id = msg.id;
                    if (!item.update()) {
                        // Ignore errors to not calcel while pipeline on fail
                        msg.delete().catch(() => {});
                        item.delete();
                        thread
                            .send(
                                `L'item **${item.item_name}** n'a pas pu être créé (update failed). Veuillez réessayer.`,
                            )
                            .catch(() => {});
                    } else await msg.pin();
                })(item),
            );
        }

        // console.log(`[INFO] Sending ${sendTasks.length} item messages to thread...`);
        // await messages
        await Promise.all(sendTasks).catch(console.error);
        // console.log(`[INFO] All item messages sent to thread.`);

        // Delete pin notifications
        if (pinsList.length > 0) {
            // console.log("[INFO] Deleting pin messages:", pinsList.join(", "));
            thread.bulkDelete(pinsList).catch(console.error);
            collector.stop();
        }

        console.log(
            `[INFO] Command ${command.c_name} created successfully in thread ${thread.id}.`,
        );
        await interaction.editReply(
            `Votre commande peut être __complétée__ dans **<#${thread.id}>** !`,
        );

        // Log command creation
        CommandContribution.log(command, `Created command '${command.c_name}'`);

        setTimeout(() => interaction.deleteReply().catch(), 15_000);
    }
}

async function pingProfsHandler(
    interaction: ButtonInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // update command server-side
    command.ping = !command.ping;
    if (!command.update()) {
        await interaction.editReply("L'interaction a échouée.");
        return;
    }

    // Update button label client-side
    const msg = interaction.message;
    const components = getCommandButtons(command);
    await msg.edit({
        components,
    });

    // Log action
    CommandContribution.log(
        command,
        `Profession ping ${command.ping ? "" : "de"}activated`,
        interaction.user.id,
    );

    // Delete reply if everything went well
    await interaction.deleteReply();
}

async function manageProfessionsHandler(
    interaction: StringSelectMenuInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    // Get database command
    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // Ownership check
    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        await interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

    // Update command status
    command.status = "Building";
    command.update();

    // Get selected professions
    const selected: string[] = interaction.values;
    const profs: CommandProfession[] = [];

    for (const s of selected) {
        const prof = new CommandProfession();
        prof.command_id = command.id;
        prof.profession_name = s;
        prof.filled = false;
        if (!prof.insert()) {
            await interaction.editReply("L'interaction a échouée.");
            profs.forEach((p) => p.delete());
            return;
        }
        profs.push(prof);
    }

    const msg = interaction.message;
    const embed = new EmbedBuilder(msg.embeds[0] as APIEmbed).setFields(
        msg.embeds[0].fields.map((f) =>
            !f.name.toLowerCase().includes("informations")
                ? f
                : {
                      name: "Professions:",
                      value: profs.map((p) => p.profession_name).join(", "),
                  },
        ),
    );

    await msg.edit({
        embeds: [embed],
        components: getCommandButtons(command),
    });

    // Build log message
    const profsStr: string = profs.map((p) => p.profession_name).join(", ");
    CommandContribution.log(
        command,
        `Added professions '${profsStr}'`,
        interaction.user.id,
    );

    await interaction.deleteReply();
}

async function closeHandler(interaction: ButtonInteraction, config: Config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        await interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

    // Log close (will still log even if unsuccessful)
    CommandContribution.log(
        command,
        `Closed command '${command.c_name}'`,
        interaction.user.id,
    );

    const reportFilepath: string = generateCommandReport(command, -1);
    console.log(`Generated report at '${reportFilepath}'`);

    if (!command.delete()) {
        await interaction.editReply(
            "Echec lors de la suppression, veuillez réessayer.",
        );
        return;
    }

    const panel = ChannelParam.getParam(
        interaction.guildId ?? "0",
        "commander",
        "panel_channel_id",
        command.settlement_id,
    );
    if (!panel) throw new Error("Something went wrong.");

    // Try to delete panel message
    // (code is messy, but i just put a try-catch to fix bigs cos i'm lazy)
    try {
        const panelMessage = await (
            (await config.bot.channels.fetch(panel.channel_id)) as TextChannel
        ).messages.fetch(command.panel_message_id ?? "-1");
        if (panelMessage) {
            const embeds = [
                EmbedBuilder.from(panelMessage.embeds[0])
                    .setColor(Colors.Red)
                    .setTitle(
                        panelMessage.embeds[0].title?.replace(
                            "Nouvelle commande !",
                            "❌ **FERME**",
                        ) ?? "❌ **FERME**",
                    ),
            ];
            await panelMessage.edit({
                content: "Commande terminée.",
                embeds: embeds,
                components: [],
                files: [reportFilepath],
            });
        }
    } catch {}

    const thread = interaction.channel as ThreadChannel;
    await thread.delete();

    const msg = await interaction.user.send("Commande supprimée avec succès");

    setTimeout(
        () =>
            msg
                .delete()
                .catch((err) =>
                    console.error(
                        `[ERROR] Couldn't delete message send to ${interaction.user.username}:\n`,
                        err,
                    ),
                ),
        5_000,
    );
}

async function readyHandler(interaction: ButtonInteraction, config: Config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        await interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

    // Get interaction message to edit components and embed
    const msg = interaction.message;

    // Edit msg embed
    const msgEmbed = EmbedBuilder.from(msg.embeds[0]).setColor(
        Colors.DarkGreen,
    );
    msgEmbed.setFields(msg.embeds[0].fields.filter((f) => f.name !== "\u200e"));

    // Edit msg components to only have claim and delete buttons
    const claimBut = new ButtonBuilder()
        .setCustomId(
            `${interaction.guildId}|commander|claimHandler|${command.id}`,
        )
        .setLabel("Auto-assigner")
        .setEmoji({ name: "✋" })
        .setStyle(ButtonStyle.Secondary);

    // Get panel to send message to
    const ppanel = ChannelParam.getParam(
        interaction.guildId ?? "0",
        "commander",
        "panel_channel_id",
        command.settlement_id,
    );
    if (!ppanel) throw new Error("Something went wrong.");

    const panel = (await config.bot.channels.fetch(ppanel.channel_id)) as
        | TextChannel
        | undefined;
    if (!panel) {
        interaction
            .editReply(
                "Le salon panels n'a pas été défini! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
            )
            .catch(console.log);
        command.delete();
        (interaction.channel as ThreadChannel).delete();
        return;
    }

    // Build panel embed
    const embed = getPanelEmbed(command);

    // Assign provider panel
    const assignMenu = new UserSelectMenuBuilder()
        .setCustomId(
            `${interaction.guildId}|commander|assignHandler|${command.id}`,
        )
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
        embeds: [embed],
        components: [panelRow1, panelRow2],
    });

    command.panel_message_id = panelMsg.id;
    command.status = "Ready";
    if (!command.update()) {
        interaction
            .editReply("Erreur de database! L'interaction a échouée.")
            .catch(console.log);
        await panelMsg.delete();
        return;
    }

    // Only edit after ready has been updated on database
    await msg.edit({
        embeds: [msgEmbed],
        components: getCommandButtons(command),
    });

    // Ping professions tags
    // get professions to ping
    const profsPing: string[] = CommandProfession.fetchArray({
        keys: "command_id",
        values: command.id,
    }).map((prof: CommandProfession) => prof.profession_name);
    // get their associated roles
    const profsRoles: ProfessionLink[] = ProfessionLink.fetchArray({
        keys: "guild_id",
        values: command.guild_id,
    }).filter((link: ProfessionLink) =>
        profsPing.includes(link.profession_name),
    );
    // Build ping message
    let pingMsg = "";
    if (command.ping && profsPing.length > 0) {
        const thread = (await config.bot.channels.fetch(
            command.thread_id,
        )) as ThreadChannel;
        const mentionStr = profsRoles.map((l) => `<@&${l.role_id}>`).join(" ");
        pingMsg = `Nouvelle commande pour les métiers: ${mentionStr}`;
        await thread.send(pingMsg);
    }

    // Only add tags after message edit was succesful
    const post: ForumThreadChannel = msg.channel as ForumThreadChannel;
    const forumId: string | null = post.parentId;
    if (!forumId) {
        await interaction.editReply(
            "Failed to apply tags for this post.\n" +
                "Please apply them manually.",
        );
        return;
    }

    const forum = (await config.bot.channels.fetch(
        forumId,
    )) as ForumChannel | null;
    if (!forum) {
        await interaction.editReply(
            "Failed to apply tags for this post.\n" +
                "Please apply them manually.",
        );
        return;
    }

    const tags = forum.availableTags;
    let toApply: Snowflake[] = [];

    // get command's assigned professions
    const profs: CommandProfession[] = CommandProfession.fetchArray({
        keys: "command_id",
        values: command.id,
    });

    // find tags to apply
    for (const prof of profs) {
        for (const tag of tags) {
            if (tag.name === prof.profession_name) {
                toApply.push(tag.id);
                break;
            }
        }
    }

    // apply them (only the first 5, discord limitation)
    await post.setAppliedTags(toApply.slice(0, 5));

    // Log
    CommandContribution.log(
        command,
        `Marked command as 'Ready'`,
        interaction.user.id,
    );

    await interaction.deleteReply();
}

async function assignHandler(
    interaction: UserSelectMenuInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // MAYBE: Only let coordinators of the right professions assign people
    // MAYBE: only propose known providers of the right professions instead of anyone
    // MAYBE: Change interaction from UserSelectMenu to StringSelectMenu with the usernames of the providers

    const chan = ChannelParam.getParam(
        interaction.guildId!,
        "commander",
        "commandes_channel_id",
        command.settlement_id,
    );
    if (!chan) {
        await interaction.editReply(
            "Le salon de commandes n'a pas été setup ! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
        );
        return;
    }

    // MAYBE: also search with provided commannd professions
    const keys = ["user_id", "guild_id", "coordinator"];
    const values: (number | string | bigint | boolean)[] = [
        interaction.user.id,
        interaction.guildId!,
        true,
    ];
    if (command.settlement_id) {
        keys.push("settlement_id");
        values.push(command.settlement_id);
    }
    if (
        !config.admins?.includes(interaction.user.id) &&
        !Fournisseur.get({
            keys: keys,
            values: values,
        })
    ) {
        await interaction.editReply(
            "Vous n'avez pas le droit de faire cette action !",
        );
        return;
    }

    const users = interaction.users;
    const thread = await (
        (await config.bot.channels.fetch(chan.channel_id)) as
            | ForumChannel
            | TextChannel
    ).threads.fetch(command.thread_id);
    if (!thread) {
        interaction
            .editReply("Le thread de la commande a été supprimé !")
            .catch(console.log);
        command.delete();
        interaction.message.delete();
        return;
    }

    await interaction.editReply("Création des rôles dans la bdd...");

    const insertAssignees: CommandAssignee[] = [];
    for (const [id, user] of users) {
        // Create assignment
        const assign = new CommandAssignee();
        assign.command_id = command.id;
        assign.user_id = id;

        // Make sure user is registered in the DB
        User.ensureUserExists(id, user.displayName);

        // If it already exists, don't push it
        if (assign.sync()) continue;

        // Try to insert in DB
        if (!assign.insert()) {
            interaction
                .editReply("Erreur de Database, veuillez réessayer.")
                .catch(console.log);
            insertAssignees.forEach((a) => a.delete());
            return;
        }

        // List of inserted assignees
        insertAssignees.push(assign);

        // Add them to the thread
        thread.members.add(user);
    }

    // Edit assigned members
    const embed = getPanelEmbed(command);

    await interaction.message.edit({
        content: interaction.message.content,
        embeds: [embed],
        components: interaction.message.components,
    });

    // Log assignment
    const usersStr: string = users
        .map((user) =>
            user.id == interaction.user.id
                ? "(himself)"
                : `${user.displayName} (${user.id})`,
        )
        .join(", ");
    CommandContribution.log(
        command,
        `Assigned following contributors: [${usersStr}]`,
        interaction.user.id,
    );

    await interaction.deleteReply();
}

async function claimHandler(interaction: ButtonInteraction, config: Config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // TODO: Make it so that only people from the right profession can claim to be apart of this order

    let thread: ThreadChannel | undefined;
    let panelMsg: Message | undefined;
    if (interaction.channelId === command.thread_id) {
        thread = interaction.channel as ThreadChannel;

        const panel = ChannelParam.getParam(
            interaction.guildId!,
            "commander",
            "panel_channel_id",
            command.settlement_id,
        );
        if (!panel) {
            await interaction.editReply(
                "Il faut setup le bot! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
            );
            return;
        }

        panelMsg = (await (
            (await config.bot.channels.fetch(panel.channel_id)) as
                | TextChannel
                | undefined
        )?.messages.fetch(command.panel_message_id!)) as Message | undefined;

        if (!panelMsg) {
            await interaction.followUp(
                "Warning: Le message du panel n'a pas pu être trouvé !",
            );
            console.warn(
                `[WARN] Commander|claimHandler: panel message not found (chanId: ${panel.channel_id}) (msgId: ${command.panel_message_id!})`,
            );
        }
    } else {
        const chan = ChannelParam.getParam(
            interaction.guildId!,
            "commander",
            "commandes_channel_id",
            command.settlement_id,
        );
        if (!chan) {
            await interaction.editReply(
                "Il faut setup le bot! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
            );
            return;
        }

        thread = (await (
            (await config.bot.channels.fetch(chan.channel_id)) as
                | ForumChannel
                | TextChannel
        ).threads.fetch(command.thread_id)) as
            | ForumThreadChannel
            | TextThreadChannel;
        if (!thread) {
            await interaction.editReply(
                "Il faut setup le bot! Veuillez d'abord utiliser `/setup_commandes` si vous êtes admin, ou contacter un admin.",
            );
            return;
        }
        panelMsg = await interaction.channel!.messages.fetch(
            command.panel_message_id!,
        )!;

        if (!panelMsg) {
            await interaction.followUp(
                "Warning: Le message du panel n'a pas pu être trouvé !",
            );
            console.warn(
                `[WARN] Commander|claimHandler: panel message not found (chanId: ${interaction.channel!.id}) (msgId: ${command.panel_message_id!})`,
            );
        }
    }

    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const assign = new CommandAssignee();
    assign.command_id = command.id;
    assign.user_id = interaction.user.id;
    if (!assign.insert()) {
        await interaction.editReply("Vous êtes déjà sur cette commande.");
        return;
    }

    thread.members.add(interaction.user).catch(console.log);

    const embed = getPanelEmbed(command);

    if (panelMsg)
        await panelMsg.edit({
            content: panelMsg.content,
            embeds: [embed],
            components: panelMsg.components,
        });

    // Log
    CommandContribution.log(
        command,
        `Assigned himself to the command`,
        interaction.user.id,
    );

    await interaction.deleteReply();
}

async function addItemsSend(interaction: ButtonInteraction, config: Config) {
    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.reply({
            content:
                "Erreur de Database, pas réussi à enregistrer l'interaction.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        await interaction.reply({
            content: "Cette commande ne vous appartient pas.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Create modal
    const modal = new ModalBuilder()
        .setCustomId(
            `${interaction.guildId}|commander|addItemsHandler|${command.id}`,
        )
        .setTitle("Format: <num> <item> ou        <item> X<num>");

    // Generate fields
    const components = Array.from({ length: 5 }, (_, i) => {
        return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
                .setCustomId(i.toString())
                .setLabel(`Item ${i + 1}`)
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setPlaceholder("optionnel"),
        );
    });

    // Add fields
    modal.addComponents(components);

    // Send modal
    await interaction.showModal(modal);
}

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

async function updatePanel(command: Command, config: Config) {
    const panelParam = ChannelParam.getParam(
        command.guild_id,
        "commander",
        "panel_channel_id",
        command.settlement_id,
    );
    const panel = (await config.bot.channels.fetch(panelParam?.channel_id!)) as
        | TextChannel
        | undefined;
    if (!panel) return;

    panel.messages
        .fetch(command.panel_message_id!)
        .then((msg) => {
            const embed = getPanelEmbed(command);
            msg.edit({
                content: msg.content,
                embeds: [embed],
                components: msg.components,
            }).catch(console.log);
        })
        .catch(console.log);
}

function getItemComponents(item: CommandItem): BaseMessageOptions {
    const progressions = CommandItemsProgression.fetchArray({
        keys: "item_id",
        values: item.id,
    }) as CommandItemsProgression[];

    const remaining = item.quantity - item.progress;

    const totalReservedRemaining = progressions.reduce(
        (acc, p) => acc + Math.max(0, p.reserved - p.progress),
        0,
    );
    const reserveDisabled = totalReservedRemaining >= remaining;

    // Buttons
    const advanceBut = new ButtonBuilder()
        .setCustomId(`|commander|advanceItemSend|${item.command_id}|${item.id}`)
        .setLabel("Avancer")
        .setEmoji("➕")
        .setStyle(ButtonStyle.Secondary);

    const completeBut = new ButtonBuilder()
        .setCustomId(
            `|commander|completeItemHandler|${item.command_id}|${item.id}`,
        )
        .setLabel("Compléter")
        .setEmoji("✅")
        .setStyle(ButtonStyle.Success);

    const reserveBut = new ButtonBuilder()
        .setCustomId(`|commander|reserveItemSend|${item.command_id}|${item.id}`)
        .setLabel("Réserver")
        .setEmoji("✋")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(reserveDisabled);

    const row =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            advanceBut,
            completeBut,
            reserveBut,
        );

    let content = `### 🔃 [${item.progress}/${item.quantity}] - ${item.item_name}`;

    if (progressions.length > 0) {
        content += "\n\n**Réservations:**";
        for (const p of progressions) {
            content += `\n- <@${p.user_id}>: [${p.progress}/${p.reserved}]`;
        }
    }

    return {
        content: shortenMessage(content),
        components: [row],
    };
}

async function addItemsHandler(
    interaction: ModalSubmitInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // get thread
    const channel = ChannelParam.getParam(
        interaction.guildId!,
        "commander",
        "commandes_channel_id",
        command.settlement_id,
    );
    if (!channel) {
        interaction
            .editReply("Salon de commandes a été retiré de la config!")
            .catch(console.log);
        return;
    }

    const thread = await (
        (await config.bot.channels.fetch(channel.channel_id)) as
            | TextChannel
            | ForumChannel
    ).threads.fetch(command.thread_id);
    if (!thread) return;

    // Create items and send related messages
    // const items: CommandItem[] = new Array<CommandItem>();
    const patterns = [
        // <num> <name>
        /^([\d _-]+)\s+(.+)$/,
        // <name> x|X<num>
        /^([\w\s_-]+?(?:\s+[tT]\d+)?)\s+[xX]\s*([\d _-]+)$/,
    ];

    // Message collector to remove pins notification
    const collector = thread.createMessageCollector({
        time: 30_000,
        filter: (m) => m.type === MessageType.ChannelPinnedMessage,
    });
    collector.on("collect", async (m) => {
        try {
            await m.delete();
        } catch {}
    });

    const itemsList: CommandItem[] = [];

    interaction.fields.fields.forEach(async (f) => {
        const val = f.value.trim();
        if (!val) return;

        const item = new CommandItem();
        item.command_id = command.id;

        for (const pattern of patterns) {
            const match = val.match(pattern);
            if (!match) continue;

            if (pattern === patterns[0]) {
                item.item_name = match[2].trim();
                item.quantity = Number(match[1].replace(/[\s_-]/g, ""));
            } else {
                item.item_name = match[1].trim();
                item.quantity = Number(match[2].replace(/[\s_-]/g, ""));
            }
            break;
        }
        if (!item.item_name || !item.quantity) return;
        item.progress = 0;
        itemsList.push(item);

        if (!item.insert()?.sync()) return;

        const msg = await thread.send(getItemComponents(item));

        item.message_id = msg.id;
        if (!item.update()) {
            await msg.delete();
            item.delete();
        } else await msg.pin();
    });

    // Update panel message
    if (command.panel_message_id) updatePanel(command, config);

    // Add items follow-up in thread
    const srcMsg = await thread.messages.fetch(command.message_id!);
    const items = shortenText(
        CommandItem.fetchArray({
            keys: "command_id",
            values: command.id,
        })
            .toSorted(
                (i1, i2) =>
                    i2.quantity - i2.progress - (i1.quantity - i1.progress),
            )
            .map((i) => {
                const nameLim = shortenText(i.item_name, 40);
                return i.progress >= i.quantity
                    ? `- ✅ ~~*[${Math.min(i.progress, i.quantity)}/${i.quantity}] - **${nameLim}***~~`
                    : `- ${`**__${i.quantity - i.progress}__**`} [${Math.min(i.progress, i.quantity)}/${i.quantity}] - **${nameLim}**`;
            })
            .join("\n"),
        2000,
    );

    await srcMsg.edit({
        content: items,
        embeds: srcMsg.embeds,
        components: srcMsg.components,
    });

    // Log
    const itemsStr: string = itemsList
        .map((item) => item.toString())
        .join(", ");
    CommandContribution.log(
        command,
        `Added the following items to the command: [${itemsStr}]`,
        interaction.user.id,
    );

    // Delete reply
    await interaction.deleteReply();
}

async function updateItem(
    command: Command,
    item: CommandItem,
    config: Config,
    message?: Message<boolean>,
) {
    let thread: ThreadChannel | undefined;
    const param = ChannelParam.getParam(
        command.guild_id,
        "commander",
        "commandes_channel_id",
        command.settlement_id,
    );
    if (!param) return;
    const threadSrc = (await config.bot.channels.fetch(param.channel_id)) as
        | TextChannel
        | ForumChannel
        | undefined;
    if (!threadSrc) return;
    thread = (await threadSrc.threads.fetch(command.thread_id)) as
        | ForumThreadChannel
        | TextThreadChannel;
    if (!thread) return;

    if (!message) message = await thread.messages.fetch(item.message_id!);

    // remove all reservations if item is completed
    if (item.progress >= item.quantity) {
        await message.delete();
        const progs: CommandItemsProgression[] =
            CommandItemsProgression.fetchArray({
                keys: "item_id",
                values: item.id,
            });
        progs.forEach((p) => p.delete());
    } else await message.edit(getItemComponents(item));

    const srcMsg = await thread.messages.fetch(command.message_id!);
    const items = shortenText(
        CommandItem.fetchArray({
            keys: "command_id",
            values: command.id,
        })
            .toSorted(
                (i1, i2) =>
                    i2.quantity - i2.progress - (i1.quantity - i1.progress),
            )
            .map((i) => {
                const nameLim = shortenText(i.item_name, 40);
                return i.progress >= i.quantity
                    ? `- ✅ ~~*[${Math.min(i.progress, i.quantity)}/${i.quantity}] - **${nameLim}***~~`
                    : `- ${`**__${i.quantity - i.progress}__**`} [${Math.min(i.progress, i.quantity)}/${i.quantity}] - **${nameLim}**`;
            })
            .join("\n"),
        2000,
    );

    await srcMsg.edit({
        content: items,
        embeds: srcMsg.embeds,
        components: srcMsg.components,
    });
}

async function advanceItemSend(interaction: ButtonInteraction, config: Config) {
    const commandId = interaction.customId.split("|")[3];
    const itemId = interaction.customId.split("|")[4];

    const command = new Command();
    command.id = commandId;

    const item = new CommandItem();
    item.id = itemId;

    if (!command.sync() || !item.sync()) {
        interaction
            .reply({
                content:
                    "Erreur de Database, pas réussi à enregistrer l'interaction.",
                flags: MessageFlags.Ephemeral,
            })
            .catch(console.log);
        return;
    }

    if (command.status.toLowerCase() !== "ready") {
        interaction
            .reply({
                content: "Cette commande n'est pas encore confirmée !",
                flags: MessageFlags.Ephemeral,
            })
            .catch(console.log);
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !CommandAssignee.fetchArray({ keys: "command_id", values: command.id })
            .map((a) => a.user_id)
            .includes(interaction.user.id) &&
        !config.admins?.includes(interaction.user.id)
    ) {
        interaction
            .reply({
                content: "Cette commande ne vous appartient pas.",
                flags: MessageFlags.Ephemeral,
            })
            .catch(console.log);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(
            `${interaction.guildId}|commander|advanceItemHandler|${command.id}|${item.id}`,
        )
        .setTitle("Combien ?")
        .addComponents([
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                [
                    new TextInputBuilder()
                        .setCustomId(`quantity`)
                        .setStyle(TextInputStyle.Short)
                        .setLabel("Quantité :")
                        .setRequired(true),
                ],
            ),
        ]);

    interaction.showModal(modal);
}

async function advanceItemHandler(
    interaction: ModalSubmitInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    const item = new CommandItem();
    item.id = interaction.customId.split("|")[4];
    if (!command.sync() || !item.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    const qtyRaw = interaction.fields.getField("quantity");
    if (!qtyRaw.value.trim().match(/^(?=.*\d)[\d\s,_-]+$/)) {
        await interaction.editReply("Mauvais format! Nombre uniquement svp");
        return;
    }

    const quantity = Number(qtyRaw.value.replace(/[\s_,-]+/g, ""));
    if (quantity <= 0) {
        await interaction.editReply(
            "Merci de rentrer un nombre strictement positif (>0) !",
        );
        return;
    }

    // handle progression
    const oldProgress = item.progress;
    item.progress = Math.min(item.quantity, item.progress + quantity);
    const added = item.progress - oldProgress;

    if (!item.update()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // update reservation if exists
    const progression = CommandItemsProgression.get({
        keys: ["item_id", "user_id"],
        values: [item.id, interaction.user.id],
    }) as CommandItemsProgression | null;

    if (progression) {
        progression.progress += added;
        if (progression.progress >= progression.reserved) {
            progression.delete();
            command.log(
                `Completed his reservation on item '${item.item_name}'${progression.progress == progression.reserved ? "" : `and contributed an additional '${progression.progress - progression.reserved}'`}`,
                interaction.user.id,
            );
        } else {
            progression.update();
            // Log
            command.log(
                `Progressed his reservation on item '${item.item_name}' by '${added}'`,
                interaction.user.id,
            );
        }

        if (item.progress >= item.quantity)
            command.log(
                `Completed item '${item.item_name}' by progressing his reservation`,
                interaction.user.id,
            );
    } // Log
    else
        command.log(
            item.progress >= item.quantity
                ? `Completed item '${item.item_name}' by providing '${added}' units`
                : `Progressed quantity '${added}' to item '${item.item_name}'`,
            interaction.user.id,
        );

    if (item.message_id) await updateItem(command, item, config);
    if (command.panel_message_id) updatePanel(command, config);

    interaction.deleteReply();
}

async function reserveItemSend(interaction: ButtonInteraction, config: Config) {
    const commandId = interaction.customId.split("|")[3];
    const itemId = interaction.customId.split("|")[4];

    const command = new Command();
    command.id = commandId;

    const item = new CommandItem();
    item.id = itemId;

    if (!command.sync() || !item.sync()) {
        interaction
            .reply({
                content:
                    "Erreur de Database, pas réussi à enregistrer l'interaction.",
                flags: MessageFlags.Ephemeral,
            })
            .catch(console.log);
        return;
    }

    if (command.status.toLowerCase() !== "ready") {
        interaction
            .reply({
                content: "Cette commande n'est pas encore confirmée !",
                flags: MessageFlags.Ephemeral,
            })
            .catch(console.log);
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(
            `${interaction.guildId}|commander|reserveItemHandler|${command.id}|${item.id}`,
        )
        .setTitle("Combien ?")
        .addComponents([
            new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(
                [
                    new TextInputBuilder()
                        .setCustomId(`quantity`)
                        .setStyle(TextInputStyle.Short)
                        .setLabel("Quantité :")
                        .setRequired(true),
                ],
            ),
        ]);

    interaction.showModal(modal);
}

async function reserveItemHandler(
    interaction: ModalSubmitInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    const item = new CommandItem();
    item.id = interaction.customId.split("|")[4];
    if (!command.sync() || !item.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    const qtyRaw = interaction.fields.getField("quantity");
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);
    if (!qtyRaw.value.trim().match(/^(?=.*\d)[\d\s,_-]+$/)) {
        await interaction.editReply("Mauvais format! Nombre uniquement svp");
        return;
    }

    let quantity = Number(qtyRaw.value.replace(/[\s_,-]+/g, ""));
    if (quantity <= 0) {
        await interaction.editReply(
            "Merci de rentrer un nombre strictement positif (>0) !",
        );
        return;
    }

    // Clamp quantity
    const progressions = CommandItemsProgression.fetchArray({
        keys: "item_id",
        values: item.id,
    }) as CommandItemsProgression[];

    const remaining = item.quantity - item.progress; // remaining reservable quantity
    const reservedRemaining = progressions.reduce(
        (acc, p) => acc + Math.max(0, p.reserved - p.progress),
        0,
    );

    const availableToReserve = Math.max(0, remaining - reservedRemaining);

    if (availableToReserve <= 0) {
        await interaction.editReply("Toute la quantité est déjà réservée !");
        return;
    }

    quantity = Math.min(quantity, availableToReserve);

    // Create (or update) reservation
    const prog = CommandItemsProgression.get({
        keys: ["item_id", "user_id"],
        values: [item.id, interaction.user.id],
    }) as CommandItemsProgression | null;

    if (prog) {
        prog.reserved += quantity;
        if (!prog.update()) {
            await interaction.editReply(
                "Erreur lors de la mise à jour de votre réservation.",
            );
            return;
        }
    } else {
        // Create
        const newProg = new CommandItemsProgression();
        newProg.item_id = item.id;
        newProg.user_id = interaction.user.id;
        newProg.reserved = quantity;
        newProg.progress = 0;

        if (!newProg.insert()) {
            await interaction.editReply(
                "Erreur lors de la création de votre réservation.",
            );
            return;
        }
    }

    // Log
    command.log(
        `Reserved quantity '${quantity}' on item '${item.item_name}'`,
        interaction.user.id,
    );

    if (item.message_id) await updateItem(command, item, config);

    interaction.deleteReply();
}

// Confirm before completing item
async function completeItemHandler(
    interaction: ButtonInteraction,
    _config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const commandId = interaction.customId.split("|")[3];
    const itemId = interaction.customId.split("|")[4];

    const item: CommandItem | null = CommandItem.get({
        keys: "id",
        values: itemId,
    });
    if (!item) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    const confirmBut = new ButtonBuilder()
        .setCustomId(`|commander|completeItemConfirm|${commandId}|${itemId}`)
        .setLabel("Oui")
        .setStyle(ButtonStyle.Success);

    const row =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
            confirmBut,
        );

    await interaction.editReply({
        content: `Etes-vous sûr de vouloir marquer [**${item.item_name}** x${item.quantity}] comme **fini** ?`,
        components: [row],
    });
}

async function completeItemConfirm(
    interaction: ButtonInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    const item = new CommandItem();
    item.id = interaction.customId.split("|")[4];
    if (!command.sync() || !item.sync()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (command.status.toLowerCase() !== "ready") {
        await interaction.editReply(
            "Cette commande n'est pas encore confirmée !",
        );
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !CommandAssignee.fetchArray({ keys: "command_id", values: command.id })
            .map((a) => a.user_id)
            .includes(interaction.user.id) &&
        !config.admins?.includes(interaction.user.id)
    ) {
        await interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

    item.progress = item.quantity;
    if (!item.update()) {
        await interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // Log
    command.log(`Completed item '${item.item_name}'`, interaction.user.id);

    // update panel and recap
    if (item.message_id) await updateItem(command, item, config);
    // remove the original ephemeral message
    await interaction.webhook.deleteMessage(interaction.message.id);
    // remove the awaited answer
    await interaction.deleteReply();
}

module.exports = {
    data: () =>
        new SlashCommandBuilder()
            .setName("commander")
            .setDescription("Créer une commande de matériaux.")
            .addStringOption((option) =>
                option
                    .setName("claim")
                    .setDescription(
                        "Claim dans lequel tu souhaites faire une commande",
                    )
                    .setRequired(false)
                    .addChoices(getSettlementsHelper(__dirname, true)),
            )
            .addAttachmentOption((option) =>
                option
                    .setName("fichier_csv")
                    .setDescription(
                        "Fichier CSV à partir duquel construire la commande",
                    )
                    .setRequired(false),
            ),

    execute: order,
    initHandler: initHandler,
    pingProfsHandler: pingProfsHandler,

    assignHandler: assignHandler,
    claimHandler: claimHandler,

    addItemsSend: addItemsSend,
    addItemsHandler: addItemsHandler,

    advanceItemSend: advanceItemSend,
    advanceItemHandler: advanceItemHandler,

    reserveItemSend: reserveItemSend,
    reserveItemHandler: reserveItemHandler,

    completeItemHandler: completeItemHandler,
    completeItemConfirm: completeItemConfirm,

    closeHandler: closeHandler,
    readyHandler: readyHandler,

    manageProfessionsHandler: manageProfessionsHandler,

    help: primaryEmbed({
        title: "Commander | Aide",
        description:
            "" +
            "Cette commande sert à passer commande auprès d'un claim, ou en global.\n" +
            "__Utilisation__: `/commander [nom du claim]`.\n" +
            'Si le nom du claim n\'est pas précisé, alors la commande sera "globale" (si tel à été setup).\n' +
            "Sinon, la liste des claims proposé par le bot sont ceux pour lesquels le système de commande a été préparé.\n" +
            "",
        fields: [
            {
                name: "\u200e",
                value: "\u200e",
            },
            {
                name: "Etapes:",
                value:
                    "" +
                    "- **Remplir un forms** (informations de base de la commande)\n" +
                    "- **Un thread est créé** (vous serez ping + lien donné), dans lequel se trouvera votre commande.\n" +
                    '- Il faudra dans ce thread **définir les items** de la commande *(bouton "Ajouter items")*, ainsi que **les professions concernées** *(menu de sélection)*.\n' +
                    "- **Appuyer sur confirmer** pour ouvrir la commande, puis attendre sa complétion.\n" +
                    '-# *(Il est possible de **fermer la commande** à tout moment avec le bouton rouge "Fermer").*',
            },
            {
                name: "\u200e",
                value: "\u200e",
            },
            {
                name: "Assigner / Participer à une commande:",
                value:
                    "" +
                    "- Les __coordinateurs__ ont la possiblité d'**assigner** des membres à une commande depuis un panel réservé.\n" +
                    "- Si un utilisateur est **assigné**, il sera ajouté __automatiquement__ au thread de la commande.\n" +
                    '- **Pour pouvoir interagir avec une commande, il faut être assigné à la commande.** *(Le bouton "Auto-assigner" en-dessous du premier message du fil (épinglé) sert à cela).*',
            },
        ],
    }),
};
