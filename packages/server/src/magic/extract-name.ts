import Card from '@/magic/db/card';
import { isEqual } from 'lodash';

const firstWordBlacklist = [
    'After',
    'Although',
    'As',
    'An',
    'For',
    'If',
    'Start',
    'What',
    'When',
];

const defaultBlacklist = [
    'Brawl',
    'Conspiracy',
    'Exile',
    'Forest',
    'Island',
    'Mountain',
    'Ninja',
    'Plains',
    'Rebound',
    'Return to Ravnica',
    'Swamp',
    'Two-Headed Giant',
    'Urza',
    'When',
    'What',
    'Life',
    'Status',
    'X',
    'Remove',
    'Sacrifice',
    'Suspend',
    'Blood',
    'Free-for-All',
    'Take',
    'Grand Melee',
    'Regenerate',
    'Day',
    'Night',
    'Fight',
    'Turn',
    'Leveler',
    'Return',
];

const lowercaseWords = [
    'a',
    'à',
    'and',
    'at',
    'but',
    'by',
    'for',
    'from',
    'in',
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

const upper = '(?:[a-z]+-)?[A-Z][-A-Za-z\'’]+';
const word = `(?:${upper}|${lowercaseWords.join('|')})`;

const normalName = `(?:\\b${upper}(?: ${word})* ${upper}|${upper}\\b)`;
const commaName = `(?:\\b${upper}(?: ${upper})*, (?:${word} )*${upper}\\b)`;

const phraseRegex = new RegExp(`${commaName}|${normalName}|\\b_{5,}\\b|B\\.F\\.M\\. \\(Big Furry Monster\\)`, 'g');

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
        this.blacklist = [...defaultBlacklist, ...(option.blacklist ?? [])];

        this.names = [];
    }

    private insert(name: { id: string, text: string, part?: number }) {
        if (!this.names.some(n => isEqual(n, name))) {
            this.names.push(name);
        }
    }

    private match(phrase: string): boolean {
        const sanitizedPhrase = /^_+$/.test(phrase) ? '_____' : phrase.replace(/’/g, '\'');

        if (this.blacklist.includes(phrase)) {
            return false;
        }

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

    private tryMatch(phrase: string): boolean {
        if (this.match(phrase)) {
            return true;
        }

        // Name's; Name, and name
        const trimmedWord = phrase.replace(/(['’]s|,)$/, '');

        if (trimmedWord !== phrase && this.guess(trimmedWord)) {
            return true;
        }

        // If Name
        if (phrase.split(' ').length > 1 && firstWordBlacklist.includes(phrase.split(' ')[0])) {
            if (this.guess(phrase.replace(/^[A-Z][a-z]+ */, ''))) {
                return true;
            }
        }

        return false;
    }

    private guess(phrase: string): boolean {
        if (this.blacklist.includes(phrase)) {
            return false;
        }

        if (this.tryMatch(phrase)) {
            return true;
        }

        // Name, Name
        const splitWords = phrase
            .split(new RegExp(`\\b(${lowercaseWords.join('|')}|(?<=, ))\\b`));

        // [A of B] and [C of D]
        for (const [i, w] of [...splitWords.entries()].reverse()) {
            const headWord = splitWords.slice(0, i).join('').trim();
            const tailWord = splitWords.slice(i + 1).join('').trim();

            if (this.blacklist.includes(headWord)) {
                break;
            }

            if (lowercaseWords.includes(w) || w === '') {
                if (this.tryMatch(headWord)) {
                    this.guess(tailWord);
                    return true;
                }
            }
        }

        // A and [B of C]
        for (const [i, w] of splitWords.entries()) {
            if (lowercaseWords.includes(w)) {
                if (this.guess(splitWords.slice(i + 1).join('').trim())) {
                    return true;
                }
            }
        }

        return false;
    }

    extract(): { id: string, text: string }[] {
        const phrases = [...this.text.matchAll(phraseRegex)].map(m => m[0]);

        for (const phrase of phrases) {
            this.guess(phrase);
        }

        return this.names;
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
