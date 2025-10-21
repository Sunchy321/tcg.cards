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
    text:        string;
    cardNames:   { id: string, name: string[] }[];
    thisName?:   { id: string, name: string[] };
    blacklist:   string[];
    ahoCorasick: AhoCorasick;

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

        // Build Aho-Corasick automaton and the name lookup map
        const patterns: string[] = [];

        for (const c of this.cardNames) {
            for (const name of c.name) {
                patterns.push(name);

                // Handle apostrophe variants
                if (name.includes('\'')) {
                    const altName = name.replace(/'/g, '’');
                    patterns.push(altName);
                }
            }

            if (c.name.length >= 2) {
                patterns.push(c.name.join('/'));
                patterns.push(c.name.join('//'));
                patterns.push(c.name.join(' // '));

                if (c.name.some(n => n.includes('\''))) {
                    const altNames = c.name.map(n => n.replace(/'/g, '’'));
                    patterns.push(altNames.join('/'));
                    patterns.push(altNames.join('//'));
                    patterns.push(altNames.join(' // '));
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
        console.log('Start match');
        const now = Date.now();

        const rawMatches = this.ahoCorasick.search(this.text);
        const longestMatches: { start: number, end: number, text: string }[] = [];

        console.log('Elapsed:', Date.now() - now);

        // Determine whether a character is a word character (supports Unicode letters, digits, underscore, and apostrophes)
        const isWordChar = (ch?: string) => ch != null && /[\p{L}\p{N}_'’]/u.test(ch);

        for (const group of rawMatches) {
            const longest = group[1].sort((a, b) => b.length - a.length)[0];
            const start = group[0] - longest.length + 1;
            const end = group[0];

            // Boundary check: treat as a whole word if both sides are non-word characters or at text boundary
            const before = start > 0 ? this.text[start - 1] : undefined;
            const after = end + 1 < this.text.length ? this.text[end + 1] : undefined;

            // Treat the position before an apostrophe as a word boundary to allow matches like "xxx's"
            const isApostrophe = after === '\'' || after === '’';

            console.debug({
                longest,
                before,
                after,
                isApostrophe,
                isWordCharBefore: isWordChar(before),
                isWordCharAfter:  isWordChar(after),
            });

            if (!isWordChar(before) && (!isWordChar(after) || isApostrophe)) {
                longestMatches.push({ start, end, text: longest });
            }
        }

        // Sort by length (desc) and filter overlaps
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
                lang: CardView.lang,
                name: sql<string[]>`array_agg(${CardView.partLocalization.name})`.as('name'),
            })
            .from(CardView)
            .where(and(
                eq(CardView.card.category, 'default'),
                sql`${'vanguard'} != ALL(${CardView.part.typeMain})`,
                sql`${'token'} != ALL(${CardView.part.typeSuper})`,
            ))
            .groupBy(CardView.cardId, CardView.lang)
        ;
    }
}
