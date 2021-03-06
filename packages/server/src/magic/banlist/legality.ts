import Card from '@/magic/db/card';
import SCard, { ISCard } from '@/magic/db/scryfall-card';
import Format from '@/magic/db/format';

import Task from '@/common/task';
import {
    Card as ICard, Category, Legality, Legalities,
} from '@interface/magic/card';
import { Format as IFormat } from '@interface/magic/format';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { isEqual } from 'lodash';

import { formats as formatList } from '@data/magic/basic';
import { convertLegality, toIdentifier } from '../util';

import { dataPath } from '@/static';

export type CardData = {
    _id: string;

    category: Category;
    legalities: ICard['legalities'][];

    parts: {
        typeMain: string[];
        typeSub?: string[];
    }[];

    versions: {
        set: string;
        number: string;
        rarity: string;
        releaseDate: string;
    }[];

    scryfall: ICard['scryfall']['oracleId'];
};

type LegalityRule = {
    name: string;
    status: Record<string, Legality>;
    exclusive?: boolean;

    patterns: {
        type: 'id' | 'set';
        value: string;
    }[];
};

type ScryfallMismatch = {
    name: string;
    status: Record<string, [Legality, Legality]>;

    cards: string[];
};

const legalityPath = join(dataPath, 'magic', 'legality');
const rulePath = join(legalityPath, 'rules');
const scryfallPath = join(legalityPath, 'scryfall-mismatch');
const setPath = join(legalityPath, 'sets');
const pennyCardPath = join(dataPath, 'magic', 'penny');
const alchemyCardPath = join(legalityPath, 'alchemy');

export function getLegalitySets(type: string): string[] {
    const result = [];

    const content = readFileSync(join(setPath, `${type}`)).toString();

    for (const line of content.split('\n')) {
        if (line.startsWith('#')) {
            continue;
        }

        result.push(...line.split(',').map(v => v.trim()));
    }

    return result;
}

export function getLegalityRules(): LegalityRule[] {
    const rules: LegalityRule[] = [];

    // Penny Dreadful whitelist
    const pennyCardFiles = readdirSync(pennyCardPath).filter(f => /^\d+.txt$/.test(f));

    const recentPennyFile = Math.max(...pennyCardFiles.map(f => Number.parseInt(f.slice(0, -4), 10)));

    const pennyCards = readFileSync(join(pennyCardPath, `${recentPennyFile}.txt`)).toString().split('\n');

    rules.push({
        name:      'penny',
        status:    { penny: 'legal' },
        exclusive: true,

        patterns: pennyCards.map(c => ({
            type:  'id',
            value: toIdentifier(c),
        })),
    });

    const files = readdirSync(rulePath);

    for (const f of files) {
        const content = readFileSync(join(rulePath, f));

        const status: LegalityRule['status'] = {};
        const patterns: LegalityRule['patterns'] = [];

        for (const line of content.toString().split('\n')) {
            if (line.trim() === '' || line.startsWith('#')) {
                continue;
            }

            const m = /^\[([a-z_,*]+):([a-z_]+)\]$/.exec(line);

            if (m != null) {
                for (const f of m[1].split(',')) {
                    // eslint-disable-next-line prefer-destructuring
                    status[f] = m[2] as Legality;
                }
            } else {
                if (/^\(.*\)$/.test(line)) {
                    patterns.push({
                        type:  'set',
                        value: line.slice(1, -1),
                    });
                } else {
                    patterns.push({

                        type:  'id',
                        value: toIdentifier(line),
                    });
                }
            }
        }

        rules.push({ name: f, status, patterns });
    }

    // Alchemy Variant Cards
    const alchemyCards = readFileSync(alchemyCardPath)
        .toString()
        .split('\n')
        .filter(v => v !== '' && !v.startsWith('#'));

    const alchemyFormats = ['alchemy', 'historic', 'historic_brawl'];

    rules.push({
        name:   'alchemy',
        status: Object.fromEntries(alchemyFormats.map(f => [f, 'unavailable'])),

        patterns: alchemyCards.map(c => ({
            type:  'id',
            value: toIdentifier(c),
        })),

    });

    rules.push({
        name:   'alchemy',
        status: {
            ...Object.fromEntries(alchemyFormats.map(f => [f, null])),
            '*': 'unavailable',
        },

        patterns: alchemyCards.map(c => ({
            type:  'id',
            value: toIdentifier(c.split(' // ').map(n => `A-${n}`).join(' // ')),
        })),

    });

    return rules;
}

function getScryfallMismatches(): ScryfallMismatch[] {
    const result = [];

    const files = readdirSync(scryfallPath);

    for (const f of files) {
        const content = readFileSync(join(scryfallPath, f));

        const status: ScryfallMismatch['status'] = {};
        const cards: ScryfallMismatch['cards'] = [];

        for (const line of content.toString().split('\n')) {
            if (line.trim() === '' || line.startsWith('#')) {
                continue;
            }

            const m = /^\[([a-z_,*]+):([a-z_]+),([a-z_]+)\]$/.exec(line);

            if (m != null) {
                for (const f of m[1].split(',')) {
                    status[f] = [m[2] as Legality, m[3] as Legality];
                }
            } else {
                cards.push(toIdentifier(line));
            }
        }

        result.push({ name: f, status, cards });
    }

    return result;
}

function testFilter(data: CardData, filter: LegalityRule['patterns'][0]): boolean {
    if (filter.type === 'id') {
        return data._id === filter.value;
    } else {
        return data.versions.some(v => v.set === filter.value)
            && !['plains', 'island', 'swamp', 'mountain', 'forest'].includes(data._id);
    }
}

function testRule(data: CardData, format: string, rule: LegalityRule): Legality | null {
    if (!rule.patterns.some(f => testFilter(data, f))) {
        return null;
    }

    if (rule.status[format] !== undefined) {
        return rule.status[format];
    } else {
        return rule.status['*'];
    }
}

function testRules(data: CardData, format: string, rules: LegalityRule[]): Legality | null {
    for (const r of rules) {
        const status = testRule(data, format, r);

        if (status != null) {
            return status;
        }

        if (r.exclusive && Object.keys(r.status).includes(format)) {
            return 'unavailable';
        }
    }

    return null;
}

const nonCardCategories = ['token', 'auxiliary', 'minigame', 'art', 'decklist', 'player', 'advertisement'];
const casualCardTypes = ['scheme', 'vanguard', 'plane', 'phenomenon', 'emblem', 'dungeon'];

const setsInformal = getLegalitySets('informal');
const setsSpecial = getLegalitySets('special');
const setsOnlyOnMTGA = getLegalitySets('mtga');
const setsPauperExclusive = [...setsOnlyOnMTGA, ...getLegalitySets('pauper-exclusive')];
const setsPauperCommanderExclusive = getLegalitySets('pauper-commander-exclusive');

export function getLegality(
    data: CardData,
    formats: IFormat[],
    rules: LegalityRule[],
): ICard['legalities'] {
    const cardId = data._id;
    const versions = data.versions.filter(v => v.releaseDate <= new Date().toLocaleDateString('en-CA'));

    const result: ICard['legalities'] = {};

    for (const f of formats) {
        const { formatId } = f;

        // This card is not released now
        if (versions.length === 0) {
            result[formatId] = 'unavailable';
            continue;
        }

        // Non-card
        if (nonCardCategories.includes(data.category)) {
            result[formatId] = 'unavailable';
            continue;
        }

        const status = testRules(data, formatId, rules);

        if (status != null) {
            result[formatId] = status;
            continue;
        }

        if (
            !['alchemy', 'historic', 'historic_brawl'].includes(formatId)
            && versions.every(v => setsOnlyOnMTGA.includes(v.set))
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
        if (data.parts.some(p => p.typeMain.some(t => casualCardTypes.includes(t)))) {
            result[formatId] = 'unavailable';
            continue;
        }

        if (f.sets != null) {
            const sets = versions.map(v => v.set);

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
            const pauperVersions = versions.filter(v => !setsPauperExclusive.includes(v.set));

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
            const pauperVersions = versions.filter(
                v => !setsPauperCommanderExclusive.includes(v.set),
            );

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

            const canBeCommander = (frontType.includes('creature') && !frontType.includes('land'))
                || (data.parts[0].typeSub?.includes('background'));

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

function legalityMatch(
    data: CardData,
    format: string,
    legality: [Legality, Legality],
    mismatches: ScryfallMismatch[],
): boolean {
    if (legality[0] === legality[1]) {
        return true;
    }

    for (const m of mismatches) {
        const status = m.status[format] ?? m.status['*'];

        if (status == null) {
            continue;
        }

        if (status[0] === legality[0] && status[1] === legality[1] && m.cards.includes(data._id)) {
            return true;
        }
    }

    return false;
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
        format: string;
        legality: [Legality, Legality];
        cards: string[];
    }[];
}

export class LegalityAssigner extends Task<Status> {
    async startImpl(): Promise<void> {
        const formats = await Format.find();

        formats.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId));

        const rules = getLegalityRules();
        const mismatches = getScryfallMismatches();

        const wrongs: Status['wrongs'] = [];

        const allCards = Card.aggregate<CardData>()
            .group({
                _id: '$cardId',

                category:   { $first: '$category' },
                legalities: { $addToSet: '$legalities' },

                parts: {
                    $first: {
                        $map: {
                            input: '$parts',
                            as:    'parts',
                            in:    {
                                typeMain: '$$parts.typeMain',
                                typeSub:  '$$parts.typeSub',
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
            });

        let count = 0;
        const total = (await Card.aggregate().group({ _id: '$cardId' })).length;

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

        const scryfalls = await SCard.aggregate<Pick<ISCard, 'legalities' | 'oracle_id'>>()
            .allowDiskUse(true)
            .group({ _id: '$oracle_id', legalities: { $first: '$legalities' } })
            .project({
                _id:        0,
                oracle_id:  '$_id',
                legalities: 1,
            });

        const toUpdate: Record<string, Legalities> = {};

        for await (const c of allCards) {
            const result = getLegality(c, formats, rules);

            const scryfall = scryfalls.find(s => s.oracle_id === c.scryfall);

            if (scryfall != null) {
                const sLegalities = convertLegality(scryfall.legalities);

                for (const f of Object.keys(result)) {
                    if (sLegalities[f] == null) {
                        continue;
                    }

                    if (!legalityMatch(c, f, [result[f], sLegalities[f]], mismatches)) {
                        const wrong = wrongs.find(
                            w => w.format === f && w.legality[0] === result[f] && w.legality[1] === sLegalities[f],
                        );

                        if (wrong != null) {
                            wrong.cards.push(c._id);
                        } else {
                            wrongs.push({
                                format:   f,
                                legality: [result[f], sLegalities[f]],
                                cards:    [c._id],
                            });
                        }
                    }
                }
            }

            if (c.legalities.length > 1 || !isEqual(result, c.legalities[0])) {
                toUpdate[c._id] = result;
            }

            count += 1;
        }

        const updateGroup: [string[], Legalities][] = [];

        for (const [id, legalities] of Object.entries(toUpdate)) {
            const group = updateGroup.find(g => isEqual(g[1], legalities));

            if (group != null) {
                group[0].push(id);
            } else {
                updateGroup.push([[id], legalities]);
            }
        }

        for (const [ids, legalities] of updateGroup) {
            await Card.updateMany({ cardId: { $in: ids } }, { legalities });
        }
    }

    stopImpl(): void { /* no-op */ }
}
