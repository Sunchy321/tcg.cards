import Card from '@/lorcana/db/card';
import Format from '@/lorcana/db/format';

import Task from '@/common/task';
import { Card as ICard, Legalities } from '@interface/lorcana/card';
import { Format as IFormat } from '@interface/lorcana/format';
import { Legality } from '@interface/lorcana/format-change';

import { castArray, isEqual } from 'lodash';

import { toIdentifier } from '@common/util/id';
import internalData from '@/internal-data';

import { formats as formatList } from '@static/lorcana/basic';
import { Aggregate } from 'mongoose';

export type CardLegalityView = ICard & {
    prints: {
        set:         string;
        number:      string;
        rarity:      string;
        releaseDate: string;
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

export function getLegalityRules(): LegalityRule[] {
    const rules: LegalityRule[] = [];

    const ruleList = internalData<string[]>('lorcana.legality.rule');

    for (const r of ruleList) {
        const yaml = internalData<RuleYAML<Legality>>(`lorcana.legality.rule.${r}`);

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

    return rules;
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

        const testResult = testRules(data, formatId, rules);

        if (testResult != null) {
            assign(testResult.status, `rule: ${testResult.rule.name}`);
            continue;
        }

        const banlistItem = f.banlist.find(b => b.id === cardId);

        if (banlistItem != null) {
            assign(banlistItem.status, `banlist: ${banlistItem.date}`);
            continue;
        }

        if (f.sets != null) {
            const sets = prints.map(v => v.set);

            if (sets.every(v => !f.sets!.includes(v))) {
                assign('unavailable', 'not-in-set');
                continue;
            }
        }

        assign('legal', 'default');
    }

    return result;
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
                    set:         '$set',
                    number:      '$number',
                    rarity:      '$rarity',
                    releaseDate: '$releaseDate',
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

        const toUpdate: Record<string, Legalities> = {};

        for await (const c of allCards) {
            const result = getLegality(c, formats, rules);

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
