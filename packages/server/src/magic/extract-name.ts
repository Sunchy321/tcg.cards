import { db } from '@/drizzle';
import { CardView } from '@/magic/schema/card';

import { and, eq, sql } from 'drizzle-orm';
import { isEqual } from 'lodash';

import internalData from '@/internal-data';
import AhoCorasick from 'ahocorasick';

export interface CardNameExtractorOption {
    text:       string;
    cardNames:  { id: string, name: string[] }[];
    thisName?:  { id: string, name: string[] };
    blacklist?: string[];
}

export default class CardNameExtractor {
    text:          string;
    cardNames:     { id: string, name: string[] }[];
    thisName?:     { id: string, name: string[] };
    blacklist:     string[];
    ahoCorasick:   AhoCorasick;
    nameToCardMap: Map<string, { cardId: string, part?: number }>;

    names: { cardId: string, text: string, part?: number }[];

    constructor(option: CardNameExtractorOption) {
        this.text = option.text;
        this.thisName = option.thisName;
        this.cardNames = option.cardNames;
        this.blacklist = [
            ...internalData<string[]>('magic.rulings.ignored-name'),
            ...(option.blacklist ?? []),
        ];

        for (const b of this.blacklist) {
            if (!this.cardNames.some(c => c.name.includes(b))) {
                this.cardNames.push({
                    id:   `pseudo:${b}`,
                    name: [b],
                });
            }
        }

        // 构建Aho-Corasick自动机和名称映射表
        const patterns: string[] = [];
        this.nameToCardMap = new Map();

        for (const c of this.cardNames) {
            for (let i = 0; i < c.name.length; i++) {
                const name = c.name[i];
                patterns.push(name);
                this.nameToCardMap.set(name, {
                    cardId: c.id,
                    part:   c.name.length > 1 ? i : undefined,
                });

                // 处理撇号变体
                if (name.includes('\'')) {
                    const altName = name.replace(/'/g, '’');
                    patterns.push(altName);
                    this.nameToCardMap.set(altName, {
                        cardId: c.id,
                        part:   c.name.length > 1 ? i : undefined,
                    });
                }
            }
        }

        this.ahoCorasick = new AhoCorasick(patterns);

        this.names = [];
    }

    private insert(name: { cardId: string, text: string, part?: number }) {
        if (this.blacklist.some(b => b === name.text)) {
            return;
        }

        if (this.names.some(n => isEqual(n, name))) {
            return;
        }

        this.names.push(name);
    }

    private sanitize(phrase: string): string {
        return phrase
            .replace(/_{5,}/g, '_____')
            .replace(/’/g, '\'');
    }

    private match(phrase: string): boolean {
        if (phrase.includes('/')) {
            const names = phrase.split(/ *\/{1,2} */).map(n => this.sanitize(n));

            const cards = this.cardNames.filter(c => isEqual(c.name, names));

            if (cards.length === 1) {
                this.insert({ cardId: cards[0].id, text: phrase });

                return true;
            }

            return false;
        } else {
            const sanitizedPhrase = this.sanitize(phrase);

            if (this.thisName != null) {
                const thisName = this.thisName.name;

                if (thisName.includes(sanitizedPhrase)) {
                    if (thisName.length > 1) {
                        const part = thisName.indexOf(sanitizedPhrase);

                        this.insert({ cardId: this.thisName.id, text: phrase, part });
                    } else {
                        this.insert({ cardId: this.thisName.id, text: phrase });
                    }

                    return true;
                }
            }

            const cards = this.cardNames.filter(c => c.name.includes(sanitizedPhrase));

            if (cards.length === 1) {
                if (cards[0].name.length > 1) {
                    const part = cards[0].name.indexOf(sanitizedPhrase);

                    this.insert({ cardId: cards[0].id, text: phrase, part });
                } else {
                    this.insert({ cardId: cards[0].id, text: phrase });
                }

                return true;
            }

            return false;
        }
    }

    extract(): { cardId: string, text: string, part?: number }[] {
        const rawMatches = this.ahoCorasick.search(this.text);
        const longestMatches: { start: number, end: number, text: string }[] = [];

        for (const group of rawMatches) {
            const longest = group[1].sort((a, b) => b.length - a.length)[0];
            longestMatches.push({
                start: group[0] - longest.length + 1,
                end:   group[0],
                text:  longest,
            });
        }

        // 按长度降序，过滤重叠
        longestMatches.sort((a, b) => b.text.length - a.text.length);

        const finalMatches: typeof longestMatches = [];
        for (const m of longestMatches) {
            if (!finalMatches.some(f => m.start < f.end && m.end > f.start)) {
                finalMatches.push(m);
                this.match(m.text);
            }
        }

        return this.names.filter(n => !n.cardId.startsWith('pseudo:'));
    }

    static async names(): Promise<{ id: string, name: string[] }[]> {
        return await db
            .select({
                id:   CardView.cardId,
                name: sql<string[]>`array_agg(${CardView.partLocalization.name})`.as('name'),
            })
            .from(CardView)
            .where(and(
                eq(CardView.card.category, 'default'),
                sql`${'vanguard'} != ALL(${CardView.part.typeMain})`,
                sql`${'token'} != ALL(${CardView.part.typeSuper})`,
            ))
            .groupBy(CardView.cardId)
        ;
    }
}
