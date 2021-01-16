import { Document } from 'mongoose';

import Format from '@/magic/db/format';
import Set from '@/magic/db/set';
import FormatChange, { IFormatChange } from '@/magic/db/format-change';
import BanlistChange, { IBanlistChange } from '@/magic/db/banlist-change';
import { fromPairs } from 'lodash';
import Card from './db/card';
import { BanlistStatus } from './banlist/interface';

/* cSpell: disable */
// Ante cards
const antes = [
    'amulet_of_quoz',
    'bronze_tablet',
    'contract_from_below',
    'darkpact',
    'demonic_attorney',
    'jeweled_bird',
    'rebirth',
    'tempest_efreet',
    'timmerian_fiends',
];

// Legendary creature and land before 1995-10-01
const legendaries = [
    'adun_oakenshield',
    'angus_mackenzie',
    'arcades_sabboth',
    'axelrod_gunnarson',
    'ayesha_tanaka',
    'barktooth_warbeard',
    'bartel_runeaxe',
    'boris_devilboon',
    'chromium',
    'dakkon_blackblade',
    'gabriel_angelfire',
    'general_jarkeld',
    'gosta_dirk',
    'gwendlyn_di_corci',
    'halfdane',
    'hammerheim',
    'hazezon_tamar',
    'hunding_gjornersen',
    'jacques_le_vert',
    'jasmine_boreal',
    'jedit_ojanen',
    'jerrard_of_the_closed_fist',
    'johan',
    'karakas',
    'kasimir_the_lone_wolf',
    'kei_takahashi',
    'lady_caleria',
    'lady_evangela',
    'lady_orca',
    'livonya_silone',
    'lord_magnus',
    'marhault_elsdragon',
    'marton_stromgald',
    'merieke_ri_berit',
    'nebuchadnezzar',
    'nicol_bolas',
    'palladia_mors',
    'pavel_maliki',
    'pendelhaven',
    'princess_lucrezia',
    'ragnar',
    'ramirez_depietro',
    'ramses_overdark',
    'rasputin_dreamweaver',
    'riven_turnbull',
    'rohgahh_of_kher_keep',
    'rubinia_soulsinger',
    'sir_shandlar_of_eberyn',
    'sivitri_scarzam',
    'skeleton_ship',
    'sol_kanar_the_swamp_king',
    'stangg',
    'sunastian_falconer',
    'tetsuo_umezawa',
    'the_lady_of_the_mountain',
    'the_tabernacle_at_pendrell_vale',
    'tobias_andrion',
    'tolaria',
    'torsten_von_ursus',
    'tor_wauki',
    'tuknir_deathlock',
    'urborg',
    'ur_drago',
    'vaevictis_asmadi',
    'xira_arien',
];
/* cSpell: enable */

const formatWithSet = ['standard', 'pioneer', 'modern', 'extended'];

export async function syncChange(): Promise<void> {
    const formats = await Format.find();
    const setIds = await Set.find({ setType: { $in: ['expansion', 'core'] } }).distinct('setId');
    const formatChanges = await FormatChange.find();
    const banlistChanges = await BanlistChange.find();

    const formatMap = fromPairs(formats.map(f => [f.formatId, f]));

    // antes
    const anteInfo: Record<string, [string, string][]> = { };

    for (const a of antes) {
        const versions = await Card.find({
            cardId: a,
            setId:  { $in: setIds },
        });

        anteInfo[a] = [];

        for (const v of versions) {
            if (!anteInfo[a].some(i => i[0] === v.setId)) {
                anteInfo[a].push([v.setId, v.releaseDate]);
            }
        }
    }

    // conspiracies
    const conspiracies = await Card.find({ 'parts.typeMain': 'conspiracy', 'lang': 'en' });

    const conspiracyInfo: Record<string, [string, string][]> = { };

    for (const c of conspiracies) {
        if (conspiracyInfo[c.cardId] == null) {
            conspiracyInfo[c.cardId] = [];
        }

        if (!conspiracyInfo[c.cardId].some(i => i[0] === c.setId)) {
            conspiracyInfo[c.cardId].push([c.setId, c.releaseDate]);
        }
    }

    // antes
    const legendaryInfo: Record<string, [string, string][]> = { };

    for (const l of legendaries) {
        const versions = await Card.find({
            cardId: l,
            setId:  { $in: setIds },
        });

        legendaryInfo[l] = [];

        for (const v of versions) {
            if (!legendaryInfo[l].some(i => i[0] === v.setId)) {
                legendaryInfo[l].push([v.setId, v.releaseDate]);
            }
        }
    }

    // Mixed list of format changes and banlist changes.
    // Banlist change is before format change if they have same date.
    const changes = [
        ...formatChanges.map(f => ['format', f] as [string, IFormatChange]),
        ...banlistChanges.map(b => ['banlist', b] as [string, IBanlistChange]),
    ].sort((a, b) => {
        if (a[1].date < b[1].date) { return -1; }
        if (a[1].date > b[1].date) { return 1; }
        if (a[0] === 'banlist' && b[0] === 'format') { return -1; }
        if (a[0] === 'format' && b[0] === 'banlist') { return 1; }
        return 0;
    });

    for (const f in formatMap) {
        formatMap[f].sets = [];
        formatMap[f].banlist = [];
    }

    for (const [t, c] of changes) {
        if (t === 'format') {
            const fc = c as IFormatChange;

            for (const c of fc.changes) {
                const formats = c.reason !== 'release'
                    ? [c.format!]
                    : formatWithSet.filter(f => {
                        const format = formatMap[f]!;
                        const nowDate = new Date();

                        const now = `${
                            nowDate.getFullYear()
                        }-${
                            (nowDate.getMonth() + 1).toString().padStart(2, '0')
                        }-${
                            nowDate.getDate().toString().padStart(2, '0')
                        }`;

                        if (fc.date > now) {
                            return false;
                        }

                        if (format.birthday != null && fc.date < format.birthday) {
                            return false;
                        }

                        if (format.deathdate != null && fc.date > format.deathdate) {
                            return false;
                        }

                        return true;
                    });

                for (const f of formats) {
                    const format = formatMap[f]!;

                    for (const i of c.in) {
                        if (format.sets.includes(i)) {
                            throw new Error(`In set ${i} is already in ${f}, date: ${fc.date}`);
                        }
                    }

                    format.sets.push(...c.in);

                    if (c.out.length === 0) {
                        continue;
                    }

                    for (const o of c.out) {
                        if (!format.sets.includes(o)) {
                            throw new Error(`Out set ${o} is not in ${f}, date: ${fc.date}`);
                        }
                    }

                    // Remove all cards that are rotated out from banlist
                    const banlistRemoved: string[] = [];

                    for (const b of format.banlist) {
                        const sets = await Card.find({
                            cardId: b.card,
                            setId:  { $in: setIds },
                        }).distinct('setId');

                        const setInFormat = sets.filter(s => format.sets.includes(s));

                        if (setInFormat.every(s => c.out.includes(s))) {
                            banlistRemoved.push(b.card);
                        }
                    }

                    if (banlistRemoved.length > 0) {
                        // Insert missed banlist change item
                        await BanlistChange.create({
                            date:     fc.date,
                            category: 'rotation',
                            link:     [],
                            changes:  banlistRemoved.map(b => ({
                                card:   b,
                                format: f,
                                status: 'unavailable' as BanlistStatus,
                            })),
                        });

                        format.banlist = format.banlist.filter(b => !banlistRemoved.includes(b.card));
                    }

                    format.sets = format.sets.filter(s => !c.out.includes(s));
                }
            }
        } else {
            const bc = c as (IBanlistChange & Document);

            for (const c of bc.changes) {
                const format = formatMap[c.format];

                if (format == null) {
                    continue;
                }

                if (['#ante', '#conspiracy', '#legendary'].includes(c.card)) {
                    const infos = ({
                        '#ante':       anteInfo,
                        '#conspiracy': conspiracyInfo,
                        '#legendary':  legendaryInfo,
                    } as Record<string, Record<string, [string, string][]>>)[c.card];

                    if (c.detail == null) {
                        c.detail = [];
                    }

                    if (c.status === 'legal' || c.status === 'unavailable') {
                        const toRemove = format.banlist.filter(b => b.source === c.card.slice(1));

                        format.banlist = format.banlist.filter(b => b.source !== c.card.slice(1));

                        c.detail = toRemove.map(b => ({ card: b.card }));
                    } else {
                        for (const [key, info] of Object.entries(infos)) {
                            if (!formatWithSet.includes(c.format) || info.some(i => format.sets.includes(i[0]))) {
                                format.banlist.push({
                                    card:   key,
                                    status: c.status!,
                                    date:   bc.date,
                                    source: c.card.slice(1),
                                });
                            }

                            const date = info.map(i => i[1]).sort()[0];

                            c.detail.push({
                                card: key,
                                date: date > bc.date ? date : undefined,
                            });
                        }
                    }
                } else if (c.card.startsWith('#{clone')) {
                    const format = formatMap[c.format];

                    const m = /^#\{clone:(.*)\}/.exec(c.card)!;

                    const srcFormats = m[1].split(',');

                    for (const f of srcFormats) {
                        for (const b of formatMap[f].banlist) {
                            if (!format.banlist.some(bf => bf.card === b.card)) {
                                format.banlist.push({
                                    card:   b.card,
                                    status: c.status || b.status,
                                    date:   bc.date,
                                    source: b.source,
                                });
                            }
                        }
                    }
                } else {
                    switch (c.status) {
                    case 'legal':
                    case 'unavailable':
                        format.banlist = format.banlist.filter(b => b.card !== c.card);
                        break;
                    default:
                        if (format.banlist.every(b => b.card !== c.card)) {
                            format.banlist.push({
                                card:   c.card,
                                status: c.status!,
                                date:   bc.date,
                            });
                        }
                    }
                }
            }

            await bc.save();
        }
    }

    for (const f in formatMap) {
        await formatMap[f].save();
    }
}
