import Task from '@/common/task';

import { db } from '@/drizzle';
import { Card, CardPart } from '@/magic/schema/card';
import { Print } from '@/magic/schema/print';
import { Format } from '@/magic/schema/format';
import { Scryfall } from '@/magic/schema/data/scryfall';

import { Legalities, Legality } from '@model/magic/schema/game-change';
import { CardPrintView } from '@model/magic/schema/print';
import { Format as IFormat } from '@model/magic/schema/format';

import { eq, inArray, sql } from 'drizzle-orm';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { castArray, isEqual } from 'lodash';

import { toIdentifier } from '@common/util/id';
import internalData from '@/internal-data';
import { convertLegality } from '../util';

import { dataPath } from '@/config';
import { formats as formatList } from '@static/magic/basic';

export type CardLegalityView = {
    cardId: string;

    card: {
        category: string;
    };

    cardParts: {
        typeMain: CardPrintView['cardPart']['typeMain'];
        typeSub:  CardPrintView['cardPart']['typeSub'];
    }[];

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
    status:     Legalities;
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
): Legalities {
    const setsInformal = getLegalitySets('informal');
    const setsSpecial = getLegalitySets('special');
    const setsOnlyOnMTGA = getLegalitySets('mtga');
    const setsPauperExclusive = [...setsOnlyOnMTGA, ...getLegalitySets('pauper-exclusive')];
    const setsPauperCommanderExclusive = getLegalitySets('pauper-commander-exclusive');

    const { cardId } = data;
    const prints = data.prints.filter(p => p.releaseDate <= new Date().toISOString().split('T')[0]);

    const result: Legalities = {};

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
        if (nonCardCategories.includes(data.card.category)) {
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

        const banlistItem = f.banlist.find(b => b.cardId === cardId);

        if (banlistItem != null) {
            assign(banlistItem.status, `banlist: ${banlistItem.date}`);
            continue;
        }

        // Casual card type)
        if (data.cardParts.some(p => p.typeMain.some(t => casualCardTypes.includes(t)))) {
            assign('unavailable', 'casual-type');
            continue;
        }

        // Stickers and Attractions
        if (data.cardParts.some(p => p.typeMain.includes('stickers') || p.typeSub?.includes('attraction'))) {
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

            const hasCommon = pauperVersions.some(v => v.rarity === 'common');

            if (!hasCommon) {
                assign('unavailable', 'pauper: no-common');
                continue;
            }
        } else if (formatId === 'pauper_commander' || formatId === 'pauper_duelcommander') {
            // Some set are not checked
            const pauperVersions = prints.filter(
                v => !setsPauperCommanderExclusive.includes(v.set),
            );

            const hasCommon = pauperVersions.some(v => v.rarity === 'common');

            const hasUncommon = pauperVersions.some(v => v.rarity === 'uncommon');

            const frontType = data.cardParts[0].typeMain;

            const canBeCommander = (frontType.includes('creature') && !frontType.includes('land'))
              || (data.cardParts[0].typeSub?.includes('background'));

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
                if (data.cardParts[0].typeMain.includes('creature') || data.cardParts[0].typeSub?.includes('background')) {
                    return true;
                }
            }
        }
    }

    // commander game changer
    if (format === 'commander') {
        if (legality[0] === 'game_changer' && legality[1] === 'legal') {
            return true;
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

export function lookupPrintsForLegality() {
    return db.select({
        cardId: Card.cardId,

        card: {
            category:         Card.category,
            scryfallOracleId: Card.scryfallOracleId,
            legalities:       Card.legalities,
        },

        cardParts: sql<CardLegalityView['cardParts']>`jsonb_agg(
                jsonb_build_object(
                    'typeMain', ${CardPart.typeMain},
                    'typeSub', ${CardPart.typeSub},
                )
            )`.as('parts'),

        prints: sql<CardLegalityView['prints']>`jsonb_agg(
                jsonb_build_object(
                    'set', ${Print.set},
                    'number', ${Print.number},
                    'rarity', ${Print.rarity},
                    'borderColor', ${Print.borderColor},
                    'securityStamp', ${Print.securityStamp},
                    'releaseDate', ${Print.releaseDate}
                )
            )`.as('prints'),
    })
        .from(Card)
        .leftJoin(CardPart, eq(CardPart.cardId, Card.cardId))
        .leftJoin(Print, eq(Print.cardId, Card.cardId))
        .$dynamic();
}

export class LegalityAssigner extends Task<Status> {
    test = false;

    async startImpl(): Promise<void> {
        const formats = await db.select()
            .from(Format)
            .then(rows => rows.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId)));

        formats.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId));

        const rules = getLegalityRules();
        const mismatches = getScryfallMismatches();

        const wrongs: Status['wrongs'] = [];

        const allCards = await lookupPrintsForLegality();

        let count = 0;
        const total = await db.$count(Card);

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

        const scryfalls = await db.select({
            oracleId:   Scryfall.oracleId,
            legalities: Scryfall.legalities,
        })
            .from(Scryfall)
            .groupBy(Scryfall.oracleId);

        const toUpdate: Record<string, Record<string, Legality>> = {};

        for await (const c of allCards) {
            const result = getLegality(c, formats, rules);

            const scryfall = scryfalls.find(s => c.card.scryfallOracleId.includes(s.oracleId));

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

            if (!isEqual(result, c.card.legalities)) {
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
                await db.update(Card)
                    .set({ legalities })
                    .where(inArray(Card.cardId, ids));
            }
        }
    }

    stopImpl(): void { /* no-op */ }
}
