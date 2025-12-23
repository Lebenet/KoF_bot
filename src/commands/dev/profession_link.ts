import { APIRole, AutocompleteInteraction, ChatInputCommandInteraction, MessageFlags, PermissionFlagsBits, Role, SlashCommandBuilder } from "discord.js";
import { primaryEmbed } from "../../utils/discordUtils";
import { Config } from "../../utils/configLoader";
import { Profession, ProfessionLink } from "../../db/dbTypes";

async function professionLink(
    interaction: ChatInputCommandInteraction,
    config: Config,
) {
    // admin check
    if (!config.admins?.includes(interaction.user.id)){
        await interaction.reply({ content: "Vous n'avez pas les permissions de faire cette commande !", flags: MessageFlags.Ephemeral });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // init ORM instance
    let link: ProfessionLink = new ProfessionLink();
    link.guild_id = interaction.guildId!;

    // get command options
    const prof_p_name: string = interaction.options.getString("profession", true);
    const role: Role | APIRole = interaction.options.getRole("role", true);
    const del: boolean = interaction.options.getBoolean("delete") ?? false;

    // update instance
    link.role_id = role.id;
    link.profession_name = prof_p_name;

    console.log(`
    Profession link: {
        id: ???,
        profession_name: ${prof_p_name},
        role_id: ${role.id},
        guild_id: ${interaction.guildId!},
    };
    `);

    // Update/Delete logic and error handling
    if (del) {
        // First fetch it (.delete() is based on PKs)
        const existLink: ProfessionLink | null = ProfessionLink.get({
            keys: ["profession_name", "role_id", "guild_id"],
            values: [link.profession_name, link.role_id, link.guild_id]
        });
        if (!existLink) {
            await interaction.editReply(`Link for <@&${role.id}> with **${prof_p_name}** doesn't exist.`);
            return;
        }
        link = existLink;

        // Then try to delete it
        if (!link.delete())
        {
            await interaction.editReply(`Something went wrong. Link for <@&${role.id}> with **${prof_p_name}** couldn't be deleted.`);
            return;
        }
        else
            await interaction.editReply(`Succesfully deleted link for role <@&${role.id}> with profession **${prof_p_name}**.`);
    } else {
        // Try to fetch after insert
        if (!link.insert()?.sync()) {
            await interaction.editReply("Unable to insert link in database. Are you sure this role doesn't already have a link?");
            return;
        }
        else
            await interaction.editReply(`Role <@&${role.id}> succesfully linked with profession **${prof_p_name}**.`);
    }
    
    // If all went well
    setTimeout(() => interaction.deleteReply().catch(console.error), 15_000);
}

async function autocomplete(
    interaction: AutocompleteInteraction,
    _config: Config,
) {
    const focusedOption = interaction.options.getFocused(true);
    let choices: { name: string, value: string }[] = [{ name: "Merci de rentrer au moins 2 lettres", value: "error" }];

    if (focusedOption.name === "profession") {
        let profs: Profession[] = Profession.fetchArray();
        if (focusedOption.value.length >= 3)
            profs = profs.filter((prof: Profession) => 
                prof.description.toLowerCase()
                    .includes(focusedOption.value.toLowerCase()) ||
                prof.p_name.toLowerCase()
                    .includes(focusedOption.value.toLowerCase())
            );

        choices = profs
            .map((prof: Profession) => {
                return { name: prof.description, value: prof.p_name };
            });
    }

    await interaction.respond(choices);
}

module.exports = {
    data: () =>
        new SlashCommandBuilder()
            .setName("profession_link")
            .setDescription("Lier un rôle discord avec une profession")
            .addStringOption((option) => option
                .setName("profession")
                .setDescription("Profession à lier")
                .setRequired(true)
                .setAutocomplete(true)
            )
            .addRoleOption((option) => option
                .setName("role")
                .setDescription("Rôle à lier (Ne peut être lié qu'une seule fois)")
                .setRequired(true)
            )
            .addBooleanOption((option) => option
                .setName("delete")
                .setDescription("True => remove from database")
                .setRequired(false)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    execute: professionLink,
    autocomplete: autocomplete,

    help: primaryEmbed({
        title: "Profession Link | Aide",
        description:
            "Cette commande sert à lier un rôle Discord avec une profession dans la DB\n" +
            "Peut servir à mentionner les rôles automatiquement dans les commandes",
        fields: [
            {
                name: "Utilisation",
                value:
                    "`/profession_link profession:<nom de la profession> role:<mention du rôle> [delete:<booleen>]`\n" + 
                    "**Exemple**: `/profession_link profession:Fishing role:@Fisherman`"
            }
        ]
    })
};