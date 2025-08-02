import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
} from "discord.js";
import { primaryEmbed, xpToLevel } from "../../utils/discordUtils";
import { Config, Skill, User, Profession } from "../../db/dbTypes";
import { getParisDatetimeSQLiteSafe } from "../../utils/taskUtils";

async function link(interaction: ChatInputCommandInteraction, config: Config) {
    let playerId: string = interaction.options.getString("player_id") ?? "";
    let playerName: string = interaction.options.getString("player_name") ?? "";

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!playerId) {
        if (!playerName) {
            interaction.editReply(
                "Utilisation incorrecte ! Faites `/help link` pour plus d'infos.",
            );
            return;
        }

        // FIXME: retrieve playerId from BitJita using name
        interaction.editReply(
            "WIP. Pas implémenté. Merci d'utiliser player_id.",
        );
        return;
    }

    // Once playerId is set;
    const res = await fetch(`https://bitjita.com/api/players/${playerId}`, {
        method: "GET",
    });
    try {
        const json = await res.json();
        if (json.error) {
            if (playerName)
                interaction.editReply("Le pseudo rentré n'est pas bon !");
            else interaction.editReply("L'ID rentré n'est pas bon !");
            return;
        }

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

        // DEBUG
        //const skillMap : { [key: string]: skillMapEntry } = {"1":{"id":1,"name":"ANY","title":"","skillCategoryStr":"None"},"2":{"id":2,"name":"Forestry","title":"Forester","skillCategoryStr":"Profession"},"3":{"id":3,"name":"Carpentry","title":"Carpenter","skillCategoryStr":"Profession"},"4":{"id":4,"name":"Masonry","title":"Mason","skillCategoryStr":"Profession"},"5":{"id":5,"name":"Mining","title":"Miner","skillCategoryStr":"Profession"},"6":{"id":6,"name":"Smithing","title":"Smith","skillCategoryStr":"Profession"},"7":{"id":7,"name":"Scholar","title":"Scholar","skillCategoryStr":"Profession"},"8":{"id":8,"name":"Leatherworking","title":"Leatherworker","skillCategoryStr":"Profession"},"9":{"id":9,"name":"Hunting","title":"Hunter","skillCategoryStr":"Profession"},"10":{"id":10,"name":"Tailoring","title":"Tailor","skillCategoryStr":"Profession"},"11":{"id":11,"name":"Farming","title":"Farmer","skillCategoryStr":"Profession"},"12":{"id":12,"name":"Fishing","title":"Fisher","skillCategoryStr":"Profession"},"13":{"id":13,"name":"Cooking","title":"Cook","skillCategoryStr":"Adventure"},"14":{"id":14,"name":"Foraging","title":"Forager","skillCategoryStr":"Profession"},"15":{"id":15,"name":"Construction","title":"Builder","skillCategoryStr":"Adventure"},"17":{"id":17,"name":"Taming","title":"Tamer","skillCategoryStr":"Adventure"},"18":{"id":18,"name":"Slayer","title":"Slayer","skillCategoryStr":"Adventure"},"19":{"id":19,"name":"Merchanting","title":"Merchant","skillCategoryStr":"Adventure"},"21":{"id":21,"name":"Sailing","title":"Sailor","skillCategoryStr":"Adventure"}};

        //const experienceList : experienceListEntry[] = [{"quantity":0,"skill_id":1},{"quantity":10125,"skill_id":3},{"quantity":176773,"skill_id":15},{"quantity":93136,"skill_id":13},{"quantity":960,"skill_id":11},{"quantity":8010,"skill_id":12},{"quantity":237653,"skill_id":14},{"quantity":89840,"skill_id":2},{"quantity":13500,"skill_id":9},{"quantity":44107,"skill_id":8},{"quantity":295341,"skill_id":4},{"quantity":66200,"skill_id":19},{"quantity":1328626,"skill_id":5},{"quantity":138091,"skill_id":21},{"quantity":7439295,"skill_id":7},{"quantity":75914,"skill_id":18},{"quantity":2553487,"skill_id":6},{"quantity":323104,"skill_id":10},{"quantity":128591,"skill_id":17}];
        // END DEBUG

        // SUBJECT TO CHANGE IF BITJITA CHANGES; REPLACE WITH ACTUAL DB CONNEXION LATER ON
        const data: any = json.player;
        playerName = data.username;
        User.ensureUserExists(
            interaction.user.id,
            interaction.user.displayName,
            0,
        );
        const user = new User();
        user.id = interaction.user.id;
        if (!user.sync()) {
            interaction.editReply("Erreur de DB ! Veuillez réessayer.");
            return;
        }

        // For later
        const exists = user.player_id;

        // Edit information
        user.player_id = playerId;
        user.player_username = playerName;
        if (!user.update()) {
            interaction.editReply(
                "Erreur de DB en ajoutant vos informations (1) ! Veuillez réessayer.",
            );
            return;
        }

        const currTime = new Date(getParisDatetimeSQLiteSafe());
        // If user has already fetched skills recently
        if (
            user.last_updated_skills &&
            user.last_updated_skills.getTime() + 5 * 60_000 >=
                currTime.getTime()
        ) {
            interaction.editReply(
                "Vos skills ont déjà été update récemment. Seulement vos informations de lien vont être update.",
            );
            return;
        }

        user.last_updated_skills = currTime;
        if (!user.update()) {
            interaction.editReply(
                "Erreur de DB en ajoutant vos informations (2) ! Veuillez réessayer.",
            );
            return;
        }

        const skills: Map<string, string> = new Map();
        const known_professions: string[] = Profession.fetchArray().map(
            (p) => p.p_name,
        );
        Object.entries(data.skillMap as skillMap)
            .filter(([_, v]) => v.title !== "")
            .forEach(([k, v]) => skills.set(k, v.name));

        const experience = (data.experience as experienceList)
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
            sk.user_id = interaction.user.id;
            sk.profession_name = e.profession_name;
            // values to update/add
            sk.level = e.level;
            sk.xp = e.xp;

            // If skill exists (update)
            if (exists) {
                if (!sk.update()) {
                    interaction.editReply(
                        `Erreur en updatant votre skill ${sk.profession_name} !`,
                    );
                    console.warn(
                        `[WARN] link: update skills: couldn't update skill ${sk.profession_name} for ${user.player_username}`,
                    );
                }
                // else console.log(sk);

                // If it doesn't (create)
            } else {
                if (!sk.insert()) {
                    interaction.editReply(
                        `Erreur en ajoutant votre skill ${sk.profession_name} !`,
                    );
                    console.warn(
                        `[WARN] link: add skills: couldn't add skill ${sk.profession_name} for ${user.player_username}`,
                    );
                }
                // else console.log(sk);
            }
        });

        interaction.editReply(
            "**Votre profil a été link** !\nVous pouvez dès à présent faire **`/profil`** pour afficher des informations à votre sujet.",
        );
    } catch (err) {
        interaction.editReply(
            "Quelque chose s'est mal passé !\nSi le site fonctionne, merci de contacter `lebenet` sur discord.",
        );
        console.error(`[ERROR] Link: something wrong happened`, err);
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName("link")
        .setDescription("Lier son profil BitCraft avec son compte Discord")
        .addStringOption((option) =>
            option
                .setName("player_name")
                .setDescription("Nom de votre compte joueur")
                .setRequired(false),
        )
        .addStringOption((option) =>
            option
                .setName("player_id")
                .setDescription(
                    "ID de votre compte joueur (disponible sur bitjita.com)",
                )
                .setRequired(false),
        ),

    execute: link,
    help: () =>
        primaryEmbed({
            title: "Link - Aide",
            description:
                "\
		Cette commande sert à **lier** votre __profil__ **BitCraft** à votre __compte__ **Discord**.\n\
		La commande dispose de 2 arguments: player_name et player_id. Au moins 1 des 2 doit être rempli.\n\
		> 2 utilisations de la commande sont possibles:",
            fields: [
                {
                    name: "- ~~`/link <player_name>`~~",
                    value: "\
				~~<__player_name__> est tout simplement votre nom en jeu.~~\n\
				~~Il est recommandé d'utiliser cette option si vous ne souhaitez pas chercher votre ID.~~\n\
				~~Le bot s'occupera ensuite de récupérer votre identifiant automatiquement.~~",
                },
                {
                    name: "- `/link <player_id>`",
                    value: "\
				<__player_id__> correspond à l'identifiant unique de votre compte BitCraft.\n\
				Si vous souhaitez le connaître, allez chercher votre pseudo sur [BitJita/players](<https://bitjita.com/players>).\n\
				L'ID sera le nombre dans le lien. (`https://bitjita.com/players/`**__<player_id>__**)",
                },
            ],
        }),
};
