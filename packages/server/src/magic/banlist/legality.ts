import Card from '@/magic/db/card';
import SCard, { ISCard } from '@/magic/db/scryfall-card';
import Format from '@/magic/db/format';

import Task from '@/common/task';
import { Card as ICard, Legalities } from '@interface/magic/card';
import { Format as IFormat } from '@interface/magic/format';
import { Legality } from '@interface/magic/format-change';

import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { castArray, isEqual } from 'lodash';

import { toIdentifier } from '@common/util/id';
import internalData from '@/internal-data';
import { convertLegality } from '../util';

import { dataPath } from '@/config';
import { formats as formatList } from '@static/magic/basic';
import { Aggregate } from 'mongoose';

export type CardLegalityView = ICard & {
    prints: {
        set:            string;
        number:         string;
        rarity:         string;
        borderColor?:   string;
        securityStamp?: string;
        releaseDate:    string;
    }[];
};

type ValueOrArray<T> = T | T[];

type RuleYAML<T> = {
    status: ValueOrArray<{
        format: ValueOrArray<string>;
        value:  T;
    }>;

    exclusive?: boolean;

    patterns: (string | { set: string })[];
};

type LegalityRule = {
    name:       string;
    status:     Record<string, Legality>;
    exclusive?: boolean;

    patterns: {
        type:  'id' | 'set';
        value: string;
    }[];
};

type ScryfallMismatch = {
    name:   string;
    status: Record<string, [Legality, Legality]>;

    patterns: {
        type:  'id' | 'set';
        value: string;
    }[];
};

const pennyCardPath = join(dataPath, 'magic', 'penny');

export function getLegalitySets(type: string): string[] {
    return internalData<string[]>(`magic.legality.set.${type}`);
}

export function getLegalityRules(): LegalityRule[] {
    const rules: LegalityRule[] = [];

    // Penny Dreadful whitelist
    const pennyCardFiles = readdirSync(pennyCardPath).filter(f => /^\d+.txt$/.test(f));

    const recentPennyFile = Math.max(...pennyCardFiles.map(f => Number.parseInt(f.slice(0, -4), 10)));

    const pennyCards = readFileSync(join(pennyCardPath, `${recentPennyFile}.txt`)).toString().split('\n');

    rules.push(
        {
            name:   'gleemox',
            status: { '*': 'banned' },

            patterns: [{
                type:  'id',
                value: 'gleemox',
            }],
        },
        {
            name:      'penny',
            status:    { penny: 'legal' },
            exclusive: true,

            patterns: pennyCards.map(c => ({
                type:  'id',
                value: toIdentifier(c),
            })),
        },
    );

    const ruleList = internalData<string[]>('magic.legality.rule');

    for (const r of ruleList) {
        const yaml = internalData<RuleYAML<Legality>>(`magic.legality.rule.${r}`);

        const status: LegalityRule['status'] = {};
        const patterns: LegalityRule['patterns'] = [];

        for (const s of castArray(yaml.status)) {
            for (const f of castArray(s.format)) {
                status[f] = s.value;
            }
        }

        for (const p of yaml.patterns) {
            if (typeof p === 'string') {
                patterns.push({
                    type:  'id',
                    value: toIdentifier(p),
                });
            } else {
                patterns.push({
                    type:  'set',
                    value: p.set,
                });
            }
        }

        rules.push({
            name:      r,
            status,
            exclusive: yaml.exclusive,
            patterns,
        });
    }

    // Alchemy Variant Cards
    const alchemyCards = internalData<string[]>('magic.legality.alchemy');

    const alchemyFormats = ['alchemy', 'historic', 'brawl'];

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

    const mismatches = internalData<string[]>('magic.legality.scryfall-mismatch');

    for (const m of mismatches) {
        const yaml = internalData<RuleYAML<[Legality, Legality]>>(`magic.legality.scryfall-mismatch.${m}`);

        const status: ScryfallMismatch['status'] = {};
        const patterns: ScryfallMismatch['patterns'] = [];

        for (const s of castArray(yaml.status)) {
            for (const f of castArray(s.format)) {
                status[f] = s.value;
            }
        }

        for (const p of yaml.patterns) {
            if (typeof p === 'string') {
                patterns.push({
                    type:  'id',
                    value: toIdentifier(p),
                });
            } else {
                patterns.push({
                    type:  'set',
                    value: p.set,
                });
            }
        }

        result.push({ name: m, status, patterns });
    }

    return result;
}

function testFilter(data: CardLegalityView, filter: LegalityRule['patterns'][0]): boolean {
    if (filter.type === 'id') {
        return data.cardId === filter.value;
    } else {
        return data.prints.some(v => v.set === filter.value)
          && !['plains', 'island', 'swamp', 'mountain', 'forest'].includes(data.cardId);
    }
}

function testRule(data: CardLegalityView, format: string, rule: LegalityRule): Legality | null {
    if (!rule.patterns.some(f => testFilter(data, f))) {
        return null;
    }

    if (rule.status[format] !== undefined) {
        return rule.status[format];
    } else {
        return rule.status['*'];
    }
}

type TestResult = { status: Legality, rule: LegalityRule };

function testRules(data: CardLegalityView, format: string, rules: LegalityRule[]): TestResult | null {
    for (const r of rules) {
        const status = testRule(data, format, r);

        if (status != null) {
            return { status, rule: r };
        }

        if (r.exclusive && Object.keys(r.status).includes(format)) {
            return { status: 'unavailable', rule: r };
        }
    }

    return null;
}

const nonCardCategories = ['token', 'auxiliary', 'minigame', 'art', 'decklist', 'player', 'advertisement'];
const casualCardTypes = ['conspiracy', 'scheme', 'vanguard', 'plane', 'phenomenon', 'emblem', 'dungeon'];

export type LegalityRecorder = Record<string, {
    result: Legality;
    reason: string;
}>;

export function getLegality(
    data: CardLegalityView,
    formats: IFormat[],
    rules: LegalityRule[],
    recorder: LegalityRecorder | undefined = undefined,
): ICard['legalities'] {
    const setsInformal = getLegalitySets('informal');
    const setsSpecial = getLegalitySets('special');
    const setsOnlyOnMTGA = getLegalitySets('mtga');
    const setsPauperExclusive = [...setsOnlyOnMTGA, ...getLegalitySets('pauper-exclusive')];
    const setsPauperCommanderExclusive = getLegalitySets('pauper-commander-exclusive');

    const { cardId } = data;
    const prints = data.prints.filter(p => p.releaseDate <= new Date().toISOString().split('T')[0]);

    const result: ICard['legalities'] = {};

    for (const f of formats) {
        const { formatId } = f;

        const assign = (value: Legality, reason: string) => {
            if (recorder != null) {
                recorder[formatId] = { result: value, reason };
            }

            result[formatId] = value;
        };

        // This card is not released now
        if (prints.length === 0) {
            assign('unavailable', 'not-released');
            continue;
        }

        // Non-card
        if (nonCardCategories.includes(data.category)) {
            assign('unavailable', 'non-card');
            continue;
        }

        const testResult = testRules(data, formatId, rules);

        if (testResult != null) {
            assign(testResult.status, `rule: ${testResult.rule.name}`);
            continue;
        }

        if (
            !['alchemy', 'historic', 'brawl', 'timeless'].includes(formatId)
            && prints.every(v => setsOnlyOnMTGA.includes(v.set))
        ) {
            assign('unavailable', 'not-on-mtga');
            continue;
        }

        // Un-cards, gift cards, etc
        if (
            prints.every(v => [...setsInformal, ...setsSpecial].includes(v.set)
              || v.securityStamp === 'acorn'
              || v.borderColor === 'silver')
            && prints.some(v => setsInformal.includes(v.set) || v.securityStamp === 'acorn' || v.borderColor === 'silver')
        ) {
            assign('unavailable', 'un-card');
            continue;
        }

        const banlistItem = f.banlist.find(b => b.id === cardId);

        if (banlistItem != null) {
            assign(banlistItem.status, `banlist: ${banlistItem.date}`);
            continue;
        }

        // Casual card type
        if (data.parts.some(p => p.type.main.some(t => casualCardTypes.includes(t)))) {
            assign('unavailable', 'casual-type');
            continue;
        }

        // Stickers and Attractions
        if (data.parts.some(p => p.type.main.includes('stickers') || p.type.sub?.includes('attraction'))) {
            if (['legacy', 'vintage', 'duelcommander', 'oathbreaker', 'pauper'].includes(formatId)) {
                assign('unavailable', 'casual-type/unf');
                continue;
            }
        }

        if (formatId === 'explorer') {
            if (result.timeless === 'unavailable' || result.pioneer === 'unavailable') {
                assign('unavailable', 'not-in-common');
                continue;
            }
        }

        if (f.sets != null && formatId !== 'explorer') {
            const sets = prints.map(v => v.set);

            if (sets.every(v => !f.sets!.includes(v))) {
                assign('unavailable', 'not-in-set');
                continue;
            }
        }

        if (formatId === 'pauper') {
            // Some set are not checked
            const pauperVersions = prints.filter(v => !setsPauperExclusive.includes(v.set));

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
                assign('unavailable', 'pauper: no-common');
                continue;
            }
        } else if (formatId === 'pauper_commander') {
            // Some set are not checked
            const pauperVersions = prints.filter(
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

            const frontType = data.parts[0].type.main;

            const canBeCommander = (frontType.includes('creature') && !frontType.includes('land'))
              || (data.parts[0].type.sub?.includes('background'));

            if (frontType.includes('conspiracy')) {
                assign('unavailable', 'casual-type');
                continue;
            }

            if (canBeCommander ? (!hasCommon && !hasUncommon) : !hasCommon) {
                assign('unavailable', 'pauper-commander: no-common');
                continue;
            }
        }

        assign('legal', 'default');
    }

    return result;
}

function legalityMatch(
    data: CardLegalityView,
    format: string,
    legality: [Legality, Legality],
    mismatches: ScryfallMismatch[],
): boolean {
    if (legality[0] === legality[1]) {
        return true;
    }

    // Pauper commander special mismatch
    if (format === 'pauper_commander') {
        if (legality[0] === 'legal' && legality[1] === 'unavailable') {
            if (data.prints.some(p => p.rarity === 'uncommon')) {
                if (data.parts[0].type.main.includes('creature') || data.parts[0].type.sub?.includes('background')) {
                    return true;
                }
            }
        }
    }

    for (const m of mismatches) {
        const status = m.status[format] ?? m.status['*'];

        if (status == null) {
            continue;
        }

        if (status[0] === legality[0] && status[1] === legality[1]) {
            for (const pt of m.patterns) {
                if (pt.type === 'id') {
                    if (pt.value === data.cardId) return true;
                } else {
                    if (data.prints.some(p => p.set === pt.value)) return true;
                }
            }
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
        elapsed:   number;
        remaining: number;
    };

    wrongs: {
        format:   string;
        legality: [Legality, Legality];
        cards:    string[];
    }[];
}

export function lookupPrintsForLegality<T>(aggregate: Aggregate<T>): void {
    aggregate.lookup({
        from:     'prints',
        let:      { cardId: '$cardId' },
        pipeline: [
            { $match: { $expr: { $eq: ['$cardId', '$$cardId'] } } },
            {
                $project: {
                    set:           '$set',
                    number:        '$number',
                    rarity:        '$rarity',
                    borderColor:   '$borderColor',
                    securityStamp: '$securityStamp',
                    releaseDate:   '$releaseDate',
                },
            },
        ],
        as: 'prints',
    });
}

export class LegalityAssigner extends Task<Status> {
    test = false;

    async startImpl(): Promise<void> {
        const formats = await Format.find();

        formats.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId));

        const rules = getLegalityRules();
        const mismatches = getScryfallMismatches();

        const wrongs: Status['wrongs'] = [];

        const allCards = Card.aggregate<CardLegalityView>();

        lookupPrintsForLegality(allCards);

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

            const scryfall = scryfalls.find(s => c.scryfall.oracleId.includes(s.oracle_id));

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
                            wrong.cards.push(c.cardId);
                        } else {
                            wrongs.push({
                                format:   f,
                                legality: [result[f], sLegalities[f]],
                                cards:    [c.cardId],
                            });
                        }
                    }
                }
            }

            if (!isEqual(result, c.legalities)) {
                toUpdate[c.cardId] = result;
            }

            count += 1;
        }

        if (!this.test) {
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
    }

    stopImpl(): void { /* no-op */ }
}
