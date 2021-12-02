import Card from '@/magic/db/card';
import ScryfallCard, { ICard as IScryfallCard } from '@/magic/db/scryfall/card';
import Format from '@/magic/db/format';

import Task from '@/common/task';
import { Card as ICard, CardType } from '@interface/magic/card';
import { Format as IFormat } from '@interface/magic/format';
import { Legalities } from '@interface/magic/scryfall/basic';

import { formats as formatList } from '@data/magic/basic';
import { toGenerator, toBucket } from '@/common/to-bucket';

export interface CardData {
    _id: string;

    cardType: CardType;
    legalities: ICard['legalities'];

    parts: {
        typeMain: string[];
    }[];

    versions: {
        set: string;
        rarity: string;
        releaseDate: string;
    }[];

    scryfall: ICard['scryfall']['oracleId'];
}

export async function getLegality(data: CardData, formats: IFormat[]): Promise<ICard['legalities']> {
    const versions = data.versions.filter(v => v.releaseDate <= new Date().toLocaleDateString('en-CA'));

    const result: ICard['legalities'] = {};

    for (const f of formats) {
        // This card is not released now
        if (versions.length === 0) {
            result[f.formatId] = 'unavailable';
            continue;
        }

        // Non-card
        if (['token', 'auxiliary', 'minigame', 'art', 'decklist', 'player', 'advertisement'].includes(data.cardType)) {
            result[f.formatId] = 'unavailable';
            continue;
        }

        if (versions.every(v => [
            /* Un-cards */ 'ugl', 'unh', 'punh', 'ust', 'pust', 'und',
            /* Set including un-cards */ 'pal04', 'j17',
            /* Test cards */ 'cmb1',
            /* Hydra game cards */ 'tfth', 'tbth', 'tdag', 'thp1', 'thp2', 'thp3',
            /* Gift cards */'psdg', 'past', 'pmic', 'ppc1',
            /* Funny gift cards */
            'pcel',
            'hho', 'h17',
            'htr16', 'htr17', 'htr18', 'htr19',
            'ptg',
        ].includes(v.set))) {
            result[f.formatId] = 'unavailable';
            continue;
        }

        // Casual card type
        if (data.parts.some(p => p.typeMain.some(t => ['scheme', 'vanguard', 'plane', 'phenomenon', 'emblem', 'dungeon'].includes(t)))) {
            result[f.formatId] = 'unavailable';
            continue;
        }

        // Cards only on MTGA
        if (f.formatId !== 'historic' && versions.every(v => ['ana', 'oana', 'xana', 'anb'].includes(v.set))) {
            result[f.formatId] = 'unavailable';
            continue;
        }

        // I don't know why
        if (f.formatId === 'historic' && data._id === 'shorecomber_crab') {
            result[f.formatId] = 'legal';
            continue;
        }

        if (f.sets != null) {
            const sets = versions.map(v => v.set).filter(s => {
                // some cards not in MTGA
                if (f.formatId === 'historic' && s === 'jmp') {
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
                        'sheoldred__whispering_one',
                        'thought_scour',
                        'time_to_feed',
                    ].includes(data._id)) {
                        return false;
                    }
                }

                return true;
            });

            if (sets.every(v => !f.sets!.includes(v))) {
                result[f.formatId] = 'unavailable';
                continue;
            }
        }

        if (f.formatId === 'pauper') {
            // Some set are not checked
            const pauperVersions = versions.filter(v => ![
                /* Sets only on MTGA */ 'ana', 'oana', 'anb',
                /* Foreign sets */ 'ren', 'rin',
                /* Promo sets */ 'wc97', 'wc98', 'wc99', 'wc00', 'wc01', 'wc02', 'wc03', 'wc04',
            ].includes(v.set));

            // I don't know why
            if (['assassin_s_blade'].includes(data._id)) {
                result[f.formatId] = 'unavailable';
                continue;
            }

            // Some cards marked as common in Gatherer are uncommon in Scryfall data
            if (
                !pauperVersions.some(v => v.rarity === 'common')
                && !['delif_s_cone'].includes(data._id)
            ) {
                result[f.formatId] = 'unavailable';
                continue;
            }
        }

        const banlistItem = f.banlist.find(b => b.card === data._id);

        if (banlistItem != null) {
            result[f.formatId] = banlistItem.status;
            continue;
        }

        // Gleemox is banned by its text
        if (data._id === 'gleemox') {
            result[f.formatId] = 'banned';
            continue;
        }

        result[f.formatId] = 'legal';
    }

    return result;
}

export function checkLegality(data: CardData, legalities: ICard['legalities'], scryfall: Legalities): string | undefined {
    for (const f of Object.keys(legalities)) {
        const sLegality = (() => {
            const legality = f === 'duelcommander' ? scryfall.duel : scryfall[f];

            return legality === 'not_legal' ? 'unavailable' : legality;
        })();

        if (sLegality != null && legalities[f] !== sLegality) {
            if (data._id === 'gleemox') {
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
                ].includes(data._id)) {
                    continue;
                }

                // Card banned as commander in duelcommander are marked as restricted by Scryfall.
                if (legalities[f] === 'banned_as_commander' && sLegality === 'restricted') {
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
                ].includes(data._id) && legalities[f] === 'unavailable' && sLegality === 'banned') {
                    continue;
                }
            } else if (f === 'pauper') {
                // The change of pauper cause this banlist change. They should be unavailable and not banned.
                if (['hada_freeblade'].includes(data._id)) {
                    continue;
                }

                // Pauper never explicitly banned conspiracy.
                if (data.parts[0].typeMain.includes('conspiracy')) {
                    continue;
                }
            } else if (f === 'brawl') {
                // Some MTGA only cards are marked as legal by Scryfall
                if (['rampaging_brontodon'].includes(data._id)) {
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

export class LegalityAssigner extends Task<Status> {
    async startImpl(): Promise<void> {
        const allCards = await Card.aggregate<CardData>([
            {
                $group: {
                    _id: '$cardId',

                    cardType:   { $first: '$cardType' },
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

        const formats = await Format.find();

        formats.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId));

        const wrongs: Status['wrongs'] = [];

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
            const scryfalls = await ScryfallCard.aggregate<IScryfallCard>()
                .match({ oracle_id: { $in: cards.map(c => c.scryfall) } })
                .group({ _id: '$oracle_id', data: { $first: '$$ROOT' } })
                .replaceRoot('data');

            for (const c of cards) {
                const result = await getLegality(c, formats);

                const scryfall = scryfalls.find(s => s.oracle_id === c.scryfall);

                if (scryfall != null) {
                    const check = checkLegality(c, result, scryfall.legalities);

                    if (check != null) {
                        wrongs.push({
                            cardId:   c._id,
                            format:   check,
                            data:     result[check],
                            scryfall: scryfall.legalities[check],
                        });
                    }
                }

                await Card.updateMany({ cardId: c._id }, { legalities: result });

                count += 1;
            }
        }
    }

    stopImpl(): void { /* no-op */ }
}
