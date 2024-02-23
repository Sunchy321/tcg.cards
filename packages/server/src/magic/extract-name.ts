import Card from '@/magic/db/card-temp';

import { isEqual } from 'lodash';
import internalData from '@/internal-data';

const lowercaseWords = [
    'a',
    'à',
    'and',
    'as',
    'at',
    'but',
    'by',
    'for',
    'from',
    'in',
    'into',
    'la',
    'le',
    'of',
    'on',
    'or',
    'the',
    'this',
    'to',
    'upon',
    'with',
];

const upper = '(?:[a-záâñöŠûü]+-)?[A-Z][-A-Za-záâñöŠûü\'’]+';
const word = `(?:${upper},?|${lowercaseWords.join('|')})`;

const normalName = `(?:\\b${upper},?(?: ${word})* ${upper}|${upper}\\b)`;

const nameRegex = `(?:Celebr-8000|B\\.F\\.M\\. \\(Big Furry Monster\\))|\\b_{5,}\\b|${normalName}`;

const phraseRegex = new RegExp(`${nameRegex}( */{1,2} *${nameRegex})*`, 'g');

export interface CardNameExtractorOption {
    text: string;
    cardNames: { id: string, name: string[] }[];
    thisName?: { id: string, name: string[] };
    blacklist?: string[];
}

export default class CardNameExtractor {
    text: string;
    cardNames: { id: string, name: string[] }[];
    thisName?: { id: string, name: string[] };
    blacklist: string[];

    names: { id: string, text: string, part?: number }[];

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

        this.names = [];
    }

    private insert(name: { id: string, text: string, part?: number }) {
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
                this.insert({ id: cards[0].id, text: phrase });

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

                        this.insert({ id: this.thisName.id, text: phrase, part });
                    } else {
                        this.insert({ id: this.thisName.id, text: phrase });
                    }

                    return true;
                }
            }

            const cards = this.cardNames.filter(c => c.name.includes(sanitizedPhrase));

            if (cards.length === 1) {
                if (cards[0].name.length > 1) {
                    const part = cards[0].name.indexOf(sanitizedPhrase);

                    this.insert({ id: cards[0].id, text: phrase, part });
                } else {
                    this.insert({ id: cards[0].id, text: phrase });
                }

                return true;
            }

            return false;
        }
    }

    private guess(phrase: string) {
        const possibleMatches = [];

        const words = phrase.split(/ *\/{1,2} *| /).map(w => this.sanitize(w.replace(/,$/, '')));

        for (const c of this.cardNames) {
            for (const n of c.name) {
                if (words.some(w => n.startsWith(w) || w.startsWith(n))) {
                    if (n === '_____') {
                        possibleMatches.push({
                            match: '_{5,}',
                            name:  n,
                        });
                    } else {
                        possibleMatches.push({
                            match: n.replace(/'/g, '[\'’]'),
                            name:  n,
                        });
                    }
                }
            }

            if (c.name.length > 1) {
                if (words.some(w => c.name[0].startsWith(w))) {
                    possibleMatches.push({
                        match: c.name.map(n => n.replace(/'/g, '[\'’]')).join(' */{1,2} *'),
                        name:  c.name.join(' // '),
                    });
                }
            }
        }

        if (possibleMatches.length === 0) {
            return;
        }

        possibleMatches.sort((a, b) => b.name.length - a.name.length);

        const regex = new RegExp(`\\b(${possibleMatches.map(m => m.match).join('|')})(?:s)?\\b`, 'g');

        const matches = phrase.matchAll(regex);

        for (const m of matches) {
            this.match(m[1]);
        }
    }

    extract(): { id: string, text: string }[] {
        const phrases = [...this.text.matchAll(phraseRegex)].map(m => m[0]);

        for (const phrase of phrases) {
            this.guess(phrase);
        }

        return this.names.filter(n => !n.id.startsWith('pseudo:'));
    }

    static async names(): Promise<{ id: string, name: string[] }[]> {
        return Card.aggregate([
            {
                $match: {
                    'category':        'default',
                    'parts.typeMain':  { $nin: ['vanguard'] },
                    'parts.typeSuper': { $nin: ['token'] },
                },
            },
            { $group: { _id: '$cardId', name: { $first: '$parts.oracle.name' } } },
            { $project: { id: '$_id', name: 1 } },
        ]);
    }
}
