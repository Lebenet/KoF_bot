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
} from "discord.js";

import {
    Command,
    CommandItem,
    CommandProfession,
    CommandAssignee,
    ChannelParam,
    Config,
    User,
    Fournisseur,
} from "../../db/dbTypes";

import { getProfessionsStringSelectMessageComp } from "../../utils/discordUtils";

async function order(
    interaction: ChatInputCommandInteraction,
    _config: Config,
) {
    if (
        Command.fetch({
            keys: "author_id",
            values: interaction.user.id,
            limit: 1,
        })
    ) {
        await interaction.reply(
            "Tu as déjà une création de commande en cours (" +
                interaction.guild?.name +
                "). Finis ou annule ta premiere commande pour en faire une nouvelle.",
        );
        return;
    }

    const guildId = interaction.guildId ?? "0";

    const chan = new ChannelParam();
    chan.command_param = "commandes_channel_id";
    chan.command_name = "commander";
    chan.guild_id = guildId;

    const panel = new ChannelParam();
    panel.command_param = "panel_channel_id";
    panel.command_name = "commander";
    panel.guild_id = guildId;

    if (!chan.sync() || !panel.sync()) {
        await interaction.reply({
            content:
                "Cette commande n'a pas encore été __setup__. Merci de d'abord faire `/setup_commandes`.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const initModal = new ModalBuilder()
        .setCustomId(`${guildId}|commander|initHandler`)
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

    const chan = ChannelParam.fetch({
        keys: ["guild_id", "command_name", "command_param"],
        values: [interaction.guildId!, "commander", "commandes_channel_id"],
        limit: 1,
    }) as ChannelParam;

    const channel = config.bot.channels.cache.get(chan.channel_id) as
        | TextChannel
        | ForumChannel;
    if (!channel) {
        await interaction.reply({
            content:
                "Le salon de commandes a été supprimé! Veuillez d'abord utiliser `/setup_commandes` ou contacter un admin.",
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

    // Order thread
    const thread = await channel.threads.create({
        name: c_name,
        autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
        reason: `Create thread for material order.`,
        message: {
            content: `\u200e${description}`,
        },
    });

    const command: Command = new Command();
    command.guild_id = interaction.guildId!;
    command.thread_id = thread.id;
    command.c_name = c_name;
    if (chest) command.chest = chest;
    if (description) command.description = description;
    command.self_supplied = self_supplied;
    command.author_id = interaction.user.id;

    if (!command.insert()?.sync()) {
        thread.delete();
        await interaction.editReply(
            `Votre commande **${c_name}** n'a pas pu être créée (insert failed). Veuillez réessayer.`,
        );
        return;
    } else {
        thread.members.add(interaction.user.id);
        await thread.join();

        // Confirm order button (send to panel)
        const readyBut = new ButtonBuilder()
            .setCustomId(`|commander|readyHandler|${command.id}`)
            .setLabel("Confirmer")
            .setStyle(ButtonStyle.Success)
            .setDisabled(true);

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

        // Profession select menu
        const opts = getProfessionsStringSelectMessageComp();
        const profs = new StringSelectMenuBuilder()
            .setCustomId(`|commander|manageProfessionsHandler|${command.id}`)
            .setPlaceholder("Métiers")
            .addOptions(opts)
            .setMaxValues(opts.length);

        // ActionRowBuilder
        const row1 =
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                readyBut,
                closeBut,
            );

        const row2 =
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                addItemsBut,
            );

        const row3 =
            new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                profs,
            );

        // Order embed
        const message = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle(command.c_name)
            .setAuthor({
                name: interaction.user.displayName,
                iconURL: interaction.user.avatarURL()!,
            })
            .setDescription(command.description)
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
                // Empty line
                { name: "\u200e", value: "\u200e" },
                {
                    name: "Informations",
                    value: "Merci de sélectionner les professions correspondant à votre commande, afin de simplifier le travail des coordinateurs.",
                },
            );

        const msg = await thread.send({
            embeds: [message],
            components: [row1, row2, row3],
        });

        msg.pin();

        command.message_id = msg.id;
        if (!command.update()) {
            thread.delete();
            command.delete();
            await interaction.editReply(
                `Votre commande **${c_name}** n'a pas pu être créée (update failed). Veuillez réessayer.`,
            );
            return;
        }

        await interaction.editReply(
            `Votre commande peut être __complétée__ dans **<#${thread.id}>** !`,
        );
        setTimeout(() => interaction.deleteReply(), 15000);
    }
}

async function manageProfessionsHandler(
    interaction: StringSelectMenuInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

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
            f.name !== "Informations"
                ? f
                : {
                      name: "Professions:",
                      value: profs.map((p) => p.profession_name).join(", "),
                  },
        ),
    );
    // Filter out the component with the matching customId
    const components = msg.components.filter(
        (row) =>
            row.type !== ComponentType.ActionRow ||
            (row.components.length > 0 &&
                !row.components.some(
                    (c) => c.customId === interaction.customId,
                )),
    );
    const updatedComponents = components.map((row) => {
        if (row.type !== ComponentType.ActionRow) return row;

        const newRow = new ActionRowBuilder<MessageActionRowComponentBuilder>();
        for (const component of row.components) {
            // If it's the button we want to enable
            if (component.type === ComponentType.Button)
                newRow.addComponents(
                    ButtonBuilder.from(component).setDisabled(false),
                );
        }
        return newRow;
    });

    msg.edit({
        embeds: [embed],
        components: updatedComponents,
    });

    interaction.deleteReply();
}

async function closeHandler(interaction: ButtonInteraction, config: Config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

    if (!command.delete()) {
        interaction.editReply(
            "Echec lors de la suppression, veuillez réessayer.",
        );
        return;
    }

    const panel = new ChannelParam();
    panel.command_param = "panel_channel_id";
    panel.command_name = "commander";
    panel.guild_id = interaction.guildId!;
    panel.sync();

    const panelMessage = (
        config.bot.channels.cache.get(panel.channel_id) as TextChannel
    ).messages.cache.get(command.panel_message_id ?? "-1");
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
        panelMessage.edit({
            content: "Commande terminée.",
            embeds: embeds,
            components: [],
        });
    }

    const thread = interaction.channel as ThreadChannel;
    await thread.delete();

    const msg = await interaction.user.send("Commande supprimée avec succès");
    setTimeout(() => {
        try {
            msg.delete();
        } catch (err) {
            console.error(
                `[ERROR] Couldn't delete message send to ${interaction.user.username}:\n`,
                err,
            );
        }
    }, 5_000);
}

async function readyHandler(interaction: ButtonInteraction, config: Config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !config.admins?.includes(interaction.user.id)
    ) {
        interaction.editReply("Cette commande ne vous appartient pas.");
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
        .setLabel("Claim")
        .setEmoji({ name: "✋" })
        .setStyle(ButtonStyle.Secondary);

    const delBut = ButtonBuilder.from(
        (msg.components[0] as ActionRow<MessageActionRowComponent>)
            .components[1] as ButtonComponent,
    );

    const msgRow =
        new ActionRowBuilder<MessageActionRowComponentBuilder>().setComponents(
            claimBut,
            delBut,
        );
    const msgRow2 = msg.components[1];

    // Get panel to send message to
    const ppanel = new ChannelParam();
    ppanel.command_param = "panel_channel_id";
    ppanel.command_name = "commander";
    ppanel.guild_id = interaction.guildId!;
    ppanel.sync();

    const panel = config.bot.channels.cache.get(ppanel.channel_id) as
        | TextChannel
        | undefined;
    if (!panel) {
        interaction.editReply(
            "Le salon panels n'a pas été défini! Faites d'abord `/setup_commandes` ou contactez un admin.",
        );
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
        interaction.editReply("Erreur de database! L'interaction a échouée.");
        panelMsg.delete();
        return;
    }

    // Only edit after ready has been updated on database
    msg.edit({
        embeds: [msgEmbed],
        components: [msgRow, msgRow2],
    });

    interaction.deleteReply();
}

async function assignHandler(
    interaction: UserSelectMenuInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // TODO: Only let coordinators of the right professions assign people
    // TODO: only propose knows providers of the right professions instead of anyone
    //   - Change interaction from UserSelectMenu to StringSelectMenu with the usernames of the providers

    const chan = ChannelParam.getParam(
        interaction.guildId!,
        "commander",
        "commandes_channel_id",
    );
    if (!chan) {
        await interaction.editReply(
            "Le salon de commandes n'a pas été setup ! Merci de faire `/setup_commandes` ou de contacter un admin.",
        );
        return;
    }

    // FIXME: also search with provided commannd professions
    if (
        !config.admins?.includes(interaction.user.id) &&
        !Fournisseur.fetch({
            keys: ["user_id", "guild_id", "coordinator"],
            values: [interaction.user.id, interaction.guildId!, true],
        })
    ) {
        interaction.editReply(
            "Vous n'avez pas le droit de faire cette action !",
        );
        return;
    }

    const users = interaction.users;
    const thread = (
        config.bot.channels.cache.get(chan.channel_id) as
            | ForumChannel
            | TextChannel
    ).threads.cache.get(command.thread_id);
    if (!thread) {
        interaction.editReply("Le thread de la commande a été supprimé !");
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
            interaction.editReply("Erreur de Database, veuillez réessayer.");
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

    interaction.message.edit({
        content: interaction.message.content,
        embeds: [embed],
        components: interaction.message.components,
    });

    interaction.deleteReply();
}

async function claimHandler(interaction: ButtonInteraction, config: Config) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // TODO: Make it so that only people from the right profession can claim to be apart of this order

    let thread: ThreadChannel | undefined;
    let panelMsg: Message;
    if (interaction.channelId === command.thread_id) {
        thread = interaction.channel as ThreadChannel;

        const panel = ChannelParam.getParam(
            interaction.guildId!,
            "commander",
            "panel_channel_id",
        );
        if (!panel) {
            await interaction.editReply(
                "Il faut setup le bot! Faut faire `/setup_commandes` ou contacter un admin.",
            );
            return;
        }

        panelMsg = (
            config.bot.channels.cache.get(panel.channel_id) as TextChannel
        ).messages.cache.get(command.panel_message_id!) as Message;
    } else {
        const chan = ChannelParam.getParam(
            interaction.guildId!,
            "commander",
            "commandes_channel_id",
        );
        if (!chan) {
            await interaction.editReply(
                "Il faut setup le bot! Faut faire `/setup_commandes` ou contacter un admin.",
            );
            return;
        }

        thread = (
            config.bot.channels.cache.get(chan.channel_id) as
                | ForumChannel
                | TextChannel
        ).threads.cache.get(command.thread_id);
        if (!thread) {
            await interaction.editReply(
                "Il faut setup le bot! Faut faire `/setup_commandes` ou contacter un admin.",
            );
            return;
        }
        panelMsg = interaction.channel!.messages.cache.get(
            command.panel_message_id!,
        )!;
    }

    User.ensureUserExists(interaction.user.id, interaction.user.displayName);

    const assign = new CommandAssignee();
    assign.command_id = command.id;
    assign.user_id = interaction.user.id;
    if (!assign.insert()) {
        interaction.editReply("Vous êtes déjà sur cette commande.");
        return;
    }

    thread.members.add(interaction.user);

    const embed = getPanelEmbed(command);

    panelMsg.edit({
        content: panelMsg.content,
        embeds: [embed],
        components: panelMsg.components,
    });

    interaction.deleteReply();
}

async function addItemsSend(interaction: ButtonInteraction, config: Config) {
    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.reply({
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
        interaction.reply({
            content: "Cette commande ne vous appartient pas.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    // Create modal
    const modal = new ModalBuilder()
        .setCustomId(`|commander|addItemsHandler|${command.id}`)
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
    interaction.showModal(modal);
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
            const len = i.item_name.length;
            const nameLim =
                i.item_name.slice(0, Math.min(40, len)) +
                (len > 50 ? "..." : "");
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

    const descLen = command.description.length;
    const desc =
        descLen < 1000
            ? command.description
            : command.description.slice(0, 997) + "...";

    const titleLen = command.c_name.length;
    const title =
        titleLen < 100 ? command.c_name : command.c_name.slice(0, 97) + "...";

    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(desc)
        .setColor(Colors.DarkAqua)
        .setFooter({ text: "Dernière update:" })
        .setTimestamp()
        .setFields([
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
}

async function updatePanel(command: Command, config: Config) {
    const panelParam = ChannelParam.getParam(
        command.guild_id,
        "commander",
        "panel_channel_id",
    );
    const panel = config.bot.channels.cache.get(panelParam?.channel_id!) as
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
            });
        })
        .catch(console.log);
}

async function addItemsHandler(
    interaction: ModalSubmitInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    if (!command.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    // get thread
    const channel = ChannelParam.getParam(
        interaction.guildId!,
        "commander",
        "commandes_channel_id",
    );
    if (!channel) {
        interaction.editReply("Salon de commandes a été retiré de la config!");
        return;
    }

    const thread = await (
        config.bot.channels.cache.get(channel.channel_id) as
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

        if (!item.insert()?.sync()) return;

        // Create components
        const advanceBut = new ButtonBuilder()
            .setCustomId(`|commander|advanceItemSend|${command.id}|${item.id}`)
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

        const msg = await thread.send({
            content: `### 🔃 [0/${item.quantity}] - ${item.item_name}`,
            components: [
                new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(
                    [advanceBut, completeBut],
                ),
            ],
        });

        item.message_id = msg.id;
        if (!item.update()) {
            msg.delete();
            item.delete();
            return;
        }
        const collector = thread.createMessageCollector({
            time: 3_000,
            filter: (m) => m.type === MessageType.ChannelPinnedMessage,
        });
        collector.on("collect", async (m) => {
            try {
                await m.delete();
            } catch {}
        });
        msg.pin();
    });
    if (command.panel_message_id) updatePanel(command, config);
    interaction.deleteReply();
}

function updateItem(
    command: Command,
    item: CommandItem,
    config: Config,
    message?: Message<boolean>,
) {
    if (!message) {
        const param = ChannelParam.getParam(
            command.guild_id,
            "commander",
            "commandes_channel_id",
        );
        if (!param) return;
        const threadSrc = config.bot.channels.cache.get(param.channel_id) as
            | TextChannel
            | ForumChannel
            | undefined;
        if (!threadSrc) return;
        const thread = threadSrc.threads.cache.get(command.thread_id);
        if (!thread) return;

        thread.messages.fetch(item.message_id!).then((msg) => {
            if (item.progress >= item.quantity) msg.delete();
            else
                msg.edit(
                    `### 🔃 [${item.progress}/${item.quantity}] - ${item.item_name}`,
                );
        });
    } else {
        if (item.progress >= item.quantity) message.delete();
        else
            message.edit(
                `### 🔃 [${item.progress}/${item.quantity}] - ${item.item_name}`,
            );
    }
}

async function advanceItemSend(interaction: ButtonInteraction, config: Config) {
    const commandId = interaction.customId.split("|")[3];
    const itemId = interaction.customId.split("|")[4];

    const command = new Command();
    command.id = commandId;

    const item = new CommandItem();
    item.id = itemId;

    if (!command.sync() || !item.sync()) {
        interaction.reply({
            content:
                "Erreur de Database, pas réussi à enregistrer l'interaction.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    if (
        interaction.user.id !== command.author_id &&
        !CommandAssignee.fetchArray({ keys: "command_id", values: command.id })
            .map((a) => a.user_id)
            .includes(interaction.user.id) &&
        !config.admins?.includes(interaction.user.id)
    ) {
        interaction.reply({
            content: "Cette commande ne vous appartient pas.",
            flags: MessageFlags.Ephemeral,
        });
        return;
    }

    const modal = new ModalBuilder()
        .setCustomId(`|commander|advanceItemHandler|${command.id}|${item.id}`)
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

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    const item = new CommandItem();
    item.id = interaction.customId.split("|")[4];
    if (!command.sync() || !item.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    const qtyRaw = interaction.fields.getField("quantity");
    if (!qtyRaw.value.trim().match(/^(?=.*\d)[\d\s,_-]+$/)) {
        interaction.editReply("Mauvais format! Nombre uniquement svp");
        return;
    }

    const quantity = Number(qtyRaw.value.replace(/[\s_,-]+/g, ""));
    if (quantity <= 0) {
        interaction.editReply(
            "Merci de rentrer un nombre strictement positif (>0) !",
        );
        return;
    }

    item.progress = Math.min(item.quantity, item.progress + quantity);
    if (!item.update()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (item.message_id) updateItem(command, item, config);
    if (command.panel_message_id) updatePanel(command, config);
    interaction.deleteReply();
}

async function completeItemHandler(
    interaction: ButtonInteraction,
    config: Config,
) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const command = new Command();
    command.id = interaction.customId.split("|")[3];
    const item = new CommandItem();
    item.id = interaction.customId.split("|")[4];
    if (!command.sync() || !item.sync()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
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
        interaction.editReply("Cette commande ne vous appartient pas.");
        return;
    }

    item.progress = item.quantity;
    if (!item.update()) {
        interaction.editReply(
            "Erreur de Database, pas réussi à enregistrer l'interaction.",
        );
        return;
    }

    if (item.message_id) updateItem(command, item, config, interaction.message);
    if (command.panel_message_id) updatePanel(command, config);
    interaction.deleteReply();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("commander")
        .setDescription("Créer une commande de matériaux."),

    execute: order,
    initHandler: initHandler,

    assignHandler: assignHandler,
    claimHandler: claimHandler,

    addItemsSend: addItemsSend,
    addItemsHandler: addItemsHandler,

    advanceItemSend: advanceItemSend,
    advanceItemHandler: advanceItemHandler,
    completeItemHandler: completeItemHandler,

    closeHandler: closeHandler,
    readyHandler: readyHandler,

    manageProfessionsHandler: manageProfessionsHandler,
};
