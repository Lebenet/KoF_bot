import { APIEmbedField, EmbedBuilder, Guild, TextChannel } from "discord.js";
import { WatchtowerStatus, Empire } from "../../db/dbTypes";
import { Config } from "../../utils/configLoader";
import { TaskData } from "../../utils/taskLoader";
import { dangerEmbed, primaryEmbed } from "../../utils/discordUtils";

type Attacker = {
    active: boolean;
    energy: number;
    startTimestamp: null | string;
    empireEntityId: number; // Empire.entityId
    empireName: string; // Empire.e_name
    attacker: boolean;
};

type Defender = {
    active: boolean;
    energy: number;
    startTimestamp: null | string;
    empireEntityId: number; // Empire.entityId
    attacker: undefined | boolean;
};

type Siege = Attacker | Defender;

function isAttacker(s: Siege): Attacker | undefined {
    return s.attacker ? (s as Attacker) : undefined;
}

function isDefender(s: Siege): Defender | undefined {
    return !s.attacker ? (s as Defender) : undefined;
}

type Watchtower = {
    entityId: string;
    locationX: number;
    locationZ: number;
    locationDimension: number; // 1 == overworld (other possible ??)
    energy: number;
    upkeep: number;
    active: boolean;
    nickname: string;
    siege: Siege[];
};

function getEmbeds(en: string, wts: Watchtower[], iu: string): EmbedBuilder[] {
    // can be optimised from 3n to n but who cares
    wts.sort((t1, t2) => t1.energy - t2.energy);
    const sieged = wts.filter(
        (wt) => wt.active && wt.siege.some((s) => s.active),
    );
    const actives = wts.filter(
        (wt) => wt.active && !wt.siege.some((s) => s.active),
    );
    const inactives = wts.filter((wt) => !wt.active);

    let embed = primaryEmbed;
    if (sieged.length > 0) embed = dangerEmbed;

    const author = { name: "\u200e", iconURL: iu };
    const title: string = `Watchtowers de ${en}`;
    const description: string =
        "Les watchtowers sous siège sont mises en avant.";
    const footer = { text: "Dernière update" };
    const timestamp = Date.now();

    // helper that groups items into fields of max 1000 chars and embeds of max 6000 chars
    function chunkCategory(
        name: string,
        items: string[],
        fields: APIEmbedField[][],
        footerLen: number,
        timestampLen: number,
    ) {
        let fieldBuff: APIEmbedField = { name, value: "", inline: false };
        let fc = 0; // field char count
        let ec = 0; // embed char count
        let fieldsBuff: APIEmbedField[] = [];

        items.forEach((str) => {
            const len = str.length + 1;
            if (fc + len > 1000) {
                // push finished field
                fieldsBuff.push({ ...fieldBuff });
                fieldBuff = { name: "\u200e", value: "", inline: false };
                fc = 0;
            }
            if (ec + fc + len > 5999) {
                // push fields into final array
                fields.push(fieldsBuff);
                fieldsBuff = [];
                ec = footerLen + timestampLen + 2;
            }
            if (fieldBuff.value !== "") {
                fieldBuff.value += "\n";
                fc++;
            }
            fieldBuff.value += str;
            fc += len;
        });

        if (fieldBuff.value) fieldsBuff.push(fieldBuff);
        if (fieldsBuff.length > 0) fields.push(fieldsBuff);
    }

    const footerLen = footer.text.length;
    const timestampLen = timestamp.toString().length;

    const fields: APIEmbedField[][] = [];
    const mkStr = (wt: Watchtower, sieges: Siege[] = []) => {
        if (sieges.length !== 0) {
            sieges = sieges.slice(0, 2);
            let attacker = isAttacker(sieges[0]);
            if (!attacker && sieges.length > 1)
                attacker = isAttacker(sieges[1]);
            let defender = isDefender(sieges[0]);
            if (!defender && sieges.length > 1)
                defender = isDefender(sieges[1]);
            if (attacker) {
                console.log(
                    attacker?.startTimestamp,
                    defender?.startTimestamp,
                    new Date(
                        attacker?.startTimestamp ??
                            defender?.startTimestamp ??
                            "0",
                    ).getTime(),
                    new Date(
                        attacker?.startTimestamp ??
                            defender?.startTimestamp ??
                            "0",
                    ),
                );
                return `**${(defender ? defender.energy : 0) + wt.energy}** / **${attacker.energy}**: *[**X**: ${Math.round(wt.locationX / 3)}, **Z**: ${Math.round(wt.locationZ / 3)}]*\n- *${wt.nickname} __vs__ ${attacker.empireName}*\n-# Siege commencé <t:${Math.round(new Date(attacker?.startTimestamp ?? defender?.startTimestamp ?? "0").getTime() / 1000)}:f>`;
            }
        }
        return wt.active
            ? `**${wt.energy}**: -${wt.upkeep}/h`
            : `-# **${wt.energy}**: *${wt.nickname}*`;
    };

    // Build groups
    chunkCategory(
        ":warning: SIEGE",
        sieged.map((wt) =>
            mkStr(
                wt,
                wt.siege.filter((s) => s.active),
            ),
        ),
        fields,
        footerLen,
        timestampLen,
    );
    chunkCategory(
        ":white_check_mark: ACTIVES",
        actives.map((wt) => mkStr(wt)),
        fields,
        footerLen,
        timestampLen,
    );
    chunkCategory(
        ":x: INACTIVES",
        inactives.map((wt) => mkStr(wt)),
        fields,
        footerLen,
        timestampLen,
    );

    // Build embeds
    const embeds: EmbedBuilder[] = [];
    fields.forEach((fset, i) => {
        embeds.push(
            embed({
                author: i === 0 ? author : null,
                title: i === 0 ? title : "\u200e",
                description: i === 0 ? description : "\u200e",
                fields: fset,
                footer,
                timestamp,
            }),
        );
    });

    return embeds;

    /*
	sieged.forEach((wt) => {
		const siege = wt.siege.find((s) => s.active);
		if (!siege) {
			actives.push(wt);
			return;
		}

		const str: string = `**${wt.energy}** / **${siege.energy}**:* **${wt.nickname}** 🆚 **${siege.empireName}** *`;
		let len = str.length;
		if (fc + len + 1 > 1000) {
			if (ec + tfc + fc > 5999) {
				// create new APIEmbedField[] (new embed)
				const tfields = Array.from(fieldsBuff);
				fields.push(tfields);
				fieldsBuff = [];
				ec = 2 + footer.text.length + timestamp.toString().length;
			}
			// create new APIEmbedField (new field in embed)
			const tfield = { name: fieldBuff.name, value: fieldBuff.value, inline: false };
			fieldsBuff.push(tfield);
			fieldBuff = { name: "\u200e", value: "", inline: false };
			fc = 1;
		} else {
			if (fieldBuff) {
				fieldBuff.value += "\n";
				len++;
			}
			fieldBuff.value += str;
			fc += len;
		}
	});
	*/
} //

export async function updateWatchtowers(_data: TaskData, config: Config) {
    const all = WatchtowerStatus.fetchArray();
    const map = new Map<string, Watchtower[]>();

    const dngrclr = dangerEmbed({}).data.color;

    for (const ws of all) {
        const eid: string = ws.empire_id;
        let emp: Watchtower[] | undefined = map.get(eid);
        if (!emp) {
            const res = await fetch(
                `https://bitjita.com/api/empires/${ws.empire_id}/towers`,
                {
                    method: "GET",
                    headers: {
                        "User-Agent": "Notary - lebenet on discord",
                    },
                },
            );
            emp = (await res.json()) as Watchtower[];
            map.set(eid, emp);
        }

        const guild: Guild = await config.bot.guilds.fetch(ws.guild_id);
        const chan = (await guild.channels.fetch(
            ws.channel_id,
        )) as TextChannel | null;
        if (!chan) continue;
        const msg = await chan.messages.fetch(ws.message_id);

        const empire: Empire | null = Empire.get({
            keys: "entityId",
            values: eid,
        });
        if (!empire) continue;
        const embeds: EmbedBuilder[] = getEmbeds(
            empire.e_name,
            emp,
            guild.iconURL() ?? config.bot.user!.avatarURL()!,
        );

        if (embeds.length === 0)
            await msg.edit({
                content: `L'empire **${empire.e_name}** n'a pas de watchtowers !`,
                embeds: [],
                components: [],
            });
        else
            await msg.edit({
                content:
                    embeds[0].data.color === dngrclr
                        ? "## :warning: DANGER, SOUS ATTAQUE"
                        : "-# Rien à signaler.",
                embeds: embeds.slice(0, 3),
                components: msg.components,
            });
    }
}

module.exports = {
    data: {
        name: "Update Watchtowers Watchers",
        interval: 15,
        time: null,
        autoStart: true,
        runOnStart: true,
        repeat: 0,
        notResetOnReload: true,
    },
    run: updateWatchtowers,
};
