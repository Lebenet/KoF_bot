import {
    ModalSubmitInteraction,
    ModalBuilder,
    ButtonBuilder,
    ButtonStyle,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    ButtonInteraction,
    UserManager,
} from "discord.js";

import { getConfig } from "./configLoader";

const savedModalInteractions = new Map();
const savedModals = new Map();

export const getModals = () => savedModals;

export function saveModalData(interaction: ModalSubmitInteraction) {
    savedModalInteractions.set(interaction.customId, [
        interaction.user.id,
        interaction.fields,
    ]);
    console.log(
        `[HOT-RELOAD] | Bot is reloading. Saving following modal data: ${savedModalInteractions.get(interaction.customId)}`,
    );
}

let waitingForUnlock = false;

export async function rebuildModals(users: UserManager) {
    // Resend all stored modals to the clients
    console.log(
        `[HOT-RELOAD] | Bot has finished reloading. Sending back saved modals.`,
    );
    for (const [
        modalId,
        [userId, fields],
    ] of savedModalInteractions.entries()) {
        const modal = new ModalBuilder()
            .setCustomId(modalId)
            .setTitle(`${modalId.split("|").at(-1)} (resent)`);

        // Add all the fields back to the modal
        for (const [key, value] of fields.fields.entries()) {
            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId(key)
                        .setLabel(key)
                        .setStyle(TextInputStyle.Short)
                        .setValue(value.value),
                ),
            );
        }

        savedModals.set(modalId, modal);

        // Get user that sent the modal
        const user = await users.fetch(userId);

        console.log(`Sending form recovery to ${user.tag}`);
        // DM him with a button to resend the modal
        await user.send({
            content:
                "Hey, the bot has finished reloading. Click the button below to retrieve your filled form.",
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`resend_modal:${modalId}`)
                        .setLabel("Reopen Form")
                        .setStyle(ButtonStyle.Primary),
                ),
            ],
        });
    }

    savedModalInteractions.clear();
}

export async function resendModal(interaction: ButtonInteraction) {
    try {
        const modalId = interaction.customId.replace("resend_modal:", "");
        const modal = savedModals.get(modalId);

        // Resend modal to the user and delete recovery button
        await interaction.message.delete();
        await interaction.showModal(modal);
        savedModals.delete(modalId);
    } catch {
        console.error(
            `[ERROR] | [HOT-RELOAD] Saver has failed to send form back to user ${interaction.user.username}`,
        );
    }
}

export async function waitForUnlock(users: UserManager, interval = 500) {
    if (waitingForUnlock) return;

    waitingForUnlock = true;
    while (true) {
        const config = getConfig();
        if (!config.locked) {
            await rebuildModals(users);
            waitingForUnlock = false;
            return;
        }

        await new Promise((resolve) => setTimeout(resolve, interval));
    }
}
