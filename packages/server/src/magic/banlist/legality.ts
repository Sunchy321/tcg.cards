import Card from '@/magic/db/card';
import SCard, { ISCard } from '@/magic/db/scryfall-card';
import Format from '@/magic/db/format';

import Task from '@/common/task';
import {
    Card as ICard, Category, Legalities,
} from '@interface/magic/card';
import { Format as IFormat } from '@interface/magic/format';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { isEqual } from 'lodash';

import { formats as formatList } from '@data/magic/basic';
import { toGenerator, toBucket } from '@/common/to-bucket';
import { convertLegality, toIdentifier } from '../util';

import { dataPath } from '@/static';

export interface CardData {
    _id: string;

    category: Category;
    legalities: ICard['legalities'];

    parts: {
        typeMain: string[];
    }[];

    versions: {
        set: string;
        number: string;
        rarity: string;
        releaseDate: string;
    }[];

    scryfall: ICard['scryfall']['oracleId'];
}

const setsInformal = [
    /* Un-cards */ 'ugl', 'unh', 'punh', 'ust', 'pust', 'und',
    /* Set including un-cards */ 'pal04', 'j17',
    /* Test cards */ 'cmb1', 'cmb2',
    /* Hydra game cards */ 'tfth', 'tbth', 'tdag', 'thp1', 'thp2', 'thp3',
    /* Gift cards */'psdg', 'past', 'pmic', 'ppc1',
    /* Funny gift cards */
    'pcel',
    'hho', 'h17',
    'htr16', 'htr17', 'htr18', 'htr19', 'htr20',
    'ptg',
];

const setsSpecial = ['plist', 'sld'];

const setsOnlyOnMTGA = ['ana', 'oana', 'xana', 'anb', 'jmp21', 'ymid', 'yneo'];

const cardsNotInJMP = [
    'ajani_s_chosen',
    'angelic_arbiter',
    'ball_lightning',
    'chain_lightning',
    'draconic_roar',
    'exhume',
    'fa_adiyah_seer',
    'flametongue_kavu',
    'goblin_lore',
    'lightning_bolt',
    'mausoleum_turnkey',
    'path_to_exile',
    'read_the_runes',
    'reanimate',
    'rhystic_study',
    'scourge_of_nel_toth',
    'scrounging_bandar',
    'sheoldred__whispering_one',
    'thought_scour',
    'time_to_feed',
];

const cardsNotInJMP21 = [
    'assault_strobe',
    'fog',
    'force_spike',
    'kraken_hatchling',
    'ponder',
    'regal_force',
    'swords_to_plowshares',
    'stormfront_pegasus',
    'tropical_island',
];

function getLegality(
    data: CardData,
    formats: IFormat[],
    pennyCards: string[],
    alchemyVariantCards: [string, string][],
): ICard['legalities'] {
    const cardId = data._id;
    const versions = data.versions.filter(v => v.releaseDate <= new Date().toLocaleDateString('en-CA'));

    const result: ICard['legalities'] = {};

    for (const f of formats) {
        const { formatId } = f;

        // Gleemox is banned by its text
        if (cardId === 'gleemox') {
            result[formatId] = 'banned';
            continue;
        }

        // This card is not released now
        if (versions.length === 0) {
            result[formatId] = 'unavailable';
            continue;
        }

        // Non-card
        if (['token', 'auxiliary', 'minigame', 'art', 'decklist', 'player', 'advertisement'].includes(data.category)) {
            result[formatId] = 'unavailable';
            continue;
        }

        if (formatId === 'penny') {
            result[formatId] = pennyCards.map(toIdentifier).includes(cardId) ? 'legal' : 'unavailable';
            continue;
        }

        // Card not in online formats. Placed here for Omnath
        if (
            ['alchemy', 'historic'].includes(formatId)
            && alchemyVariantCards.map(v => v[0]).includes(cardId)
        ) {
            result[formatId] = 'unavailable';
            continue;
        }

        // Cards only in online formats
        if (
            !['alchemy', 'historic'].includes(formatId)
            && (
                versions.every(v => setsOnlyOnMTGA.includes(v.set))
                || alchemyVariantCards.map(v => v[1]).includes(cardId)
            )
        ) {
            result[formatId] = 'unavailable';
            continue;
        }

        const banlistItem = f.banlist.find(b => b.card === cardId);

        if (banlistItem != null) {
            result[formatId] = banlistItem.status;
            continue;
        }

        if (
            versions.every(v => [...setsInformal, ...setsSpecial].includes(v.set))
            && versions.some(v => setsInformal.includes(v.set))
        ) {
            result[formatId] = 'unavailable';
            continue;
        }

        // Casual card type
        if (data.parts.some(p => p.typeMain.some(t => ['scheme', 'vanguard', 'plane', 'phenomenon', 'emblem', 'dungeon'].includes(t)))) {
            result[formatId] = 'unavailable';
            continue;
        }

        // I don't know why
        if (formatId === 'historic' && cardId === 'shorecomber_crab') {
            result[formatId] = 'legal';
            continue;
        }

        if (formatId === 'alchemy' && cardId === 'a_blood_artist') {
            result[formatId] = 'legal';
            continue;
        }

        if (f.sets != null) {
            const sets = versions.filter(({ set }) => {
                // some cards not in MTGA
                if (['explorer', 'historic'].includes(formatId)) {
                    if (set === 'jmp' && cardsNotInJMP.includes(cardId)) {
                        return false;
                    } else if (set === 'jmp21' && cardsNotInJMP21.includes(cardId)) {
                        return false;
                    }
                }

                return true;
            }).map(v => v.set);

            if (formatId === 'explorer') {
                const historic = formats.find(f => f.formatId === 'historic')!;
                const pioneer = formats.find(f => f.formatId === 'pioneer')!;

                if (
                    sets.every(v => !historic.sets!.includes(v))
                    || sets.every(v => !pioneer.sets!.includes(v))
                ) {
                    result[formatId] = 'unavailable';
                    continue;
                }
            } else {
                if (sets.every(v => !f.sets!.includes(v))) {
                    result[formatId] = 'unavailable';
                    continue;
                }
            }
        }

        if (formatId === 'pauper') {
            // Some set are not checked
            const pauperVersions = versions.filter(v => ![
                ...setsOnlyOnMTGA,
                /* MO Promo set */ 'ppro', 'prm',
                /* Foreign sets */ 'ren', 'rin',
                /* Promo sets */ 'wc97', 'wc98', 'wc99', 'wc00', 'wc01', 'wc02', 'wc03', 'wc04',
            ].includes(v.set));

            const hasCommon = (() => {
                // I don't know why
                if (['assassin_s_blade'].includes(cardId)) {
                    return false;
                }

                // Some cards marked as common in Gatherer are uncommon in Scryfall data
                if (['delif_s_cone'].includes(cardId)) {
                    return true;
                }

                return pauperVersions.some(v => v.rarity === 'common');
            })();

            if (!hasCommon) {
                result[formatId] = 'unavailable';
                continue;
            }
        } else if (formatId === 'pauper_commander') {
            // Some set are not checked
            const pauperVersions = versions.filter(v => ![
                /* MO Promo set */ 'ppro', 'prm',
                /* Promo sets */ 'wc97', 'wc98', 'wc99', 'wc00', 'wc01', 'wc02', 'wc03', 'wc04',
            ].includes(v.set));

            const hasCommon = (() => {
                if ([
                    'assassin_s_blade', // I don't know why
                    'swords_to_plowshares', // The common version is conjured by other cards
                ].includes(cardId)) {
                    return false;
                }

                // Some cards marked as common in Gatherer are uncommon in Scryfall data
                if (['delif_s_cone'].includes(cardId)) {
                    return true;
                }

                return pauperVersions.some(v => v.rarity === 'common');
            })();

            const hasUncommon = (() => pauperVersions.some(v => v.rarity === 'uncommon'))();

            const frontType = data.parts[0].typeMain;

            const canBeCommander = frontType.includes('creature') && !frontType.includes('land');

            if (frontType.includes('conspiracy')) {
                result[formatId] = 'unavailable';
                continue;
            }

            if (canBeCommander ? (!hasCommon && !hasUncommon) : !hasCommon) {
                result[formatId] = 'unavailable';
                continue;
            }
        }

        result[formatId] = 'legal';
    }

    return result;
}

function checkLegality(data: CardData, legalities: Legalities, scryfall: Legalities): string | undefined {
    const cardId = data._id;

    for (const f of Object.keys(legalities)) {
        if (scryfall[f] != null && legalities[f] !== scryfall[f]) {
            if (cardId === 'gleemox') {
                continue;
            }

            if (f === 'duelcommander') {
                if ([
                    // Duelcommander banned offensive cards explicitly but Scryfall marked them as legal.
                    'invoke_prejudice',
                    'cleanse',
                    'stone_throwing_devils',
                    'pradesh_gypsies',
                    'jihad',
                    'imprison',
                    'crusade',

                    // Walking Dead cards are on the contrary.
                    'negan__the_cold_blooded',
                    'glenn__the_voice_of_calm',
                    'michonne__ruthless_survivor',
                    'rick__steadfast_leader',
                    'daryl__hunter_of_walkers',
                    'lucille',
                ].includes(cardId)) {
                    continue;
                }

                // Conspiracy are marked as not legal but they are actually banned.
                if (data.parts[0].typeMain.includes('conspiracy')) {
                    continue;
                }
            } else if (f === 'historic') {
                // These cards are not on MTGA at all.
                if ([
                    'ajani_s_chosen',
                    'angelic_arbiter',
                    'ball_lightning',
                    'chain_lightning',
                    'draconic_roar',
                    'exhume',
                    'fa_adiyah_seer',
                    'flametongue_kavu',
                    'goblin_lore',
                    'lightning_bolt',
                    'mausoleum_turnkey',
                    'path_to_exile',
                    'read_the_runes',
                    'reanimate',
                    'rhystic_study',
                    'scourge_of_nel_toth',
                    'scrounging_bandar',
                    // 'sheoldred__whispering_one',
                    'thought_scour',
                    'time_to_feed',
                ].includes(cardId) && legalities[f] === 'unavailable' && scryfall[f] === 'banned') {
                    continue;
                }
            } else if (f === 'pauper') {
                // The change of pauper cause this banlist change. They should be unavailable and not banned.
                if (['hada_freeblade'].includes(cardId)) {
                    continue;
                }

                // Pauper never explicitly bans conspiracy.
                if (data.parts[0].typeMain.includes('conspiracy')) {
                    continue;
                }
            } else if (f === 'pauper_commander') {
                // Ante and offensive cards are explicitly banned by Pauper Commander
                if (['tempest_efreet', 'pradesh_gypsies', 'stone_throwing_devils'].includes(cardId)) {
                    continue;
                }
            } else if (f === 'brawl') {
                // Some MTGA only cards are marked as legal by Scryfall
                if (['rampaging_brontodon'].includes(cardId)) {
                    continue;
                }
            } else if (f === 'alchemy') {
                if (data.versions.some(v => v.set === 'snc')) {
                    continue;
                }
            }

            return f;
        }
    }

    return undefined;
}

interface Status {
    amount: {
        count: number;
        total: number;
    };

    time: {
        elapsed: number;
        remaining: number;
    };

    wrongs: {
        cardId: string;
        format: string;
        data: string;
        scryfall: string;
    }[];
}

const pennyCardPath = join(dataPath, 'magic', 'penny');
const alchemyCardPath = join(dataPath, 'magic', 'alchemy.txt');

export class LegalityAssigner extends Task<Status> {
    async startImpl(): Promise<void> {
        const formats = await Format.find();

        formats.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId));

        const pennyCardFiles = readdirSync(pennyCardPath).filter(f => /^\d+.txt$/.test(f));

        const recentPennyFile = Math.max(...pennyCardFiles.map(f => Number.parseInt(f.slice(0, -4), 10)));

        const pennyCards = readFileSync(join(pennyCardPath, `${recentPennyFile}.txt`))
            .toString()
            .split('\n');

        const alchemyVariantCards = readFileSync(alchemyCardPath)
            .toString()
            .split('\n')
            .filter(v => v !== '')
            .map(v => [
                toIdentifier(v),
                toIdentifier(v.split(' // ').map(n => `A-${n}`).join(' // ')),
            ] as [string, string]);

        const wrongs: Status['wrongs'] = [];

        const allCards = await Card.aggregate<CardData>([
            {
                $group: {
                    _id: '$cardId',

                    category:   { $first: '$category' },
                    legalities: { $first: '$legalities' },

                    parts: {
                        $first: {
                            $map: {
                                input: '$parts',
                                as:    'parts',
                                in:    {
                                    typeMain: '$$parts.typeMain',
                                },
                            },
                        },
                    },

                    versions: {
                        $addToSet: {
                            set:         '$set',
                            number:      '$number',
                            rarity:      '$rarity',
                            releaseDate: '$releaseDate',
                        },
                    },

                    scryfall: {
                        $first: '$scryfall.oracleId',
                    },
                },
            },
        ]);

        let count = 0;
        const total = allCards.length;

        const start = Date.now();

        this.intervalProgress(500, () => {
            const elapsed = Date.now() - start;

            return {
                amount: { total, count },

                time: {
                    elapsed,
                    remaining: (elapsed / count) * (total - count),
                },

                wrongs,
            };
        });

        for (const cards of toBucket<CardData>(toGenerator(allCards), 500)) {
            const scryfalls = await SCard.aggregate<ISCard>()
                .match({ oracle_id: { $in: cards.map(c => c.scryfall) } })
                .group({ _id: '$oracle_id', data: { $first: '$$ROOT' } })
                .replaceRoot('data');

            // eslint-disable-next-line no-loop-func
            await Promise.all(cards.map(async c => {
                const result = getLegality(
                    c,
                    formats,
                    pennyCards,
                    alchemyVariantCards,
                );

                const scryfall = scryfalls.find(s => s.oracle_id === c.scryfall);

                if (scryfall != null) {
                    const sLegalities = convertLegality(scryfall.legalities);

                    const check = checkLegality(c, result, sLegalities);

                    if (check != null) {
                        wrongs.push({
                            cardId:   c._id,
                            format:   check,
                            data:     result[check],
                            scryfall: sLegalities[check],
                        });
                    }
                }

                if (!isEqual(result, c.legalities)) {
                    await Card.updateMany({ cardId: c._id }, { legalities: result });
                }

                count += 1;
            }));
        }
    }

    stopImpl(): void { /* no-op */ }
}
