import Task from '@/common/task';

import { Card as ICard } from '@interface/magic/card';
import { RawRuling } from '@interface/magic/scryfall/card';
import Card from '@/magic/db/card';

import LineReader from '@/common/line-reader';

import { Status } from '../status';

import { join } from 'path';
import { chunk } from 'lodash';
import { convertJson, bulkPath } from './common';

const firstWordBlacklist = [
    'As',
    'After',
    'For',
    'If',
    'Start',
    'When',
];

const wordBlacklist = [
    'Forest',
    'Island',
    'Mountain',
    'Ninja',
    'Plains',
    'Rebound',
    'Swamp',
    'When',
    'X',
    'Two-Headed Giant',
    'Return to Ravnica',
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

const uppercaseWordRegex = '(?:[a-z]+-)?[A-Z][-A-Za-z’,]+';
const nameWordRegex = `(?:${uppercaseWordRegex}|${lowercaseWords.join('|')})`;

const wordSplitRegex = new RegExp(`\\b(${uppercaseWordRegex} (?:${nameWordRegex} )*${uppercaseWordRegex}|${uppercaseWordRegex})\\b`);

export class CardNameExtractor {
    text: string;
    thisName: { id: string, name: string[] };
    cardNames: { id: string, name: string[] }[];

    names: { id: string, text: string }[];

    constructor(
        text: string,
        thisName: { id: string, name: string[] },
        cardNames: { id: string, name: string[] }[],
    ) {
        this.text = text;
        this.thisName = thisName;
        this.cardNames = cardNames;
        this.names = [];
    }

    match(word: string): boolean {
        const deburredWord = word.replace(/’/g, '\'');

        if (this.names.some(n => n.text === word)) {
            return false;
        }

        if (wordBlacklist.includes(word)) {
            return false;
        }

        if (this.thisName.name.includes(deburredWord)) {
            this.names.push({ id: this.thisName.id, text: word });
            return true;
        }

        const cards = this.cardNames.filter(c => c.name.includes(deburredWord));

        if (cards.length === 1) {
            this.names.push({ id: cards[0].id, text: word });
            return true;
        }

        return false;
    }

    tryMatch(word: string): boolean {
        if (this.match(word)) {
            return true;
        }

        // Name's; Name, and name
        const trimmedWord = word.replace(/(’s|,)$/, '');

        if (trimmedWord !== word && this.guess(trimmedWord)) {
            return true;
        }

        // If Name
        if (word.split(' ').length > 1 && firstWordBlacklist.includes(word.split(' ')[0])) {
            if (this.guess(word.replace(/^[A-Z][a-z]+ */, ''))) {
                return true;
            }
        }

        return false;
    }

    guess(word: string): boolean {
        if (wordBlacklist.includes(word)) {
            return false;
        }

        if (this.tryMatch(word)) {
            return true;
        }

        // Name and Name
        const splitWords = word
            .split(new RegExp(`\\b(${lowercaseWords.join('|')})\\b`));

        // [A of B] and [C of D]
        for (const [i, w] of [...splitWords.entries()].reverse()) {
            const headWord = splitWords.slice(0, i).join('').trim();
            const tailWord = splitWords.slice(i + 1).join('').trim();

            if (wordBlacklist.includes(headWord)) {
                break;
            }

            if (lowercaseWords.includes(w)) {
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
        const words = this.text.split(wordSplitRegex)
            .filter(v => wordSplitRegex.test(v));

        for (const word of words) {
            this.guess(word);
        }

        return this.names;
    }
}

async function assignRuling(id: string, data: RawRuling[], cardNames: { id: string, name: string[] }[]) {
    const card = await Card.findOne({ 'scryfall.oracleId': id });

    if (card == null) {
        return;
    }

    const rulings = data.map(r => {
        const cards = new CardNameExtractor(
            r.comment,
            { id: card.cardId, name: card.parts.map(p => p.oracle.name) },
            cardNames,
        ).extract();

        return {
            source: r.source,
            date:   r.published_at,
            text:   r.comment,
            cards,
        } as ICard['rulings'][0];
    });

    await Card.updateMany({ cardId: card.cardId }, { rulings });
}

const chunkSize = 20;

export default class RulingLoader extends Task<Status> {
    file: string;
    filePath: string;
    lineReader: LineReader;

    init(fileName: string): void {
        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
        const cardNames = await Card.aggregate([
            { $match: { category: 'default' } },
            { $group: { _id: '$cardId', name: { $first: '$parts.oracle.name' } } },
            { $project: { id: '$_id', name: 1 } },
        ]) as { id: string, name: string[] }[];

        let total = 0;
        let count = 0;

        // start timer
        let start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type:   'ruling',

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        // evaluate total card count
        for await (const line of this.lineReader.get()) {
            if (line !== '[' && line !== ']') {
                total += 1;
            }
        }

        this.lineReader.reset();

        start = Date.now();

        const rulingMap: Record<string, RawRuling[]> = {};

        for await (const ruling of convertJson<RawRuling>(this.lineReader.get())) {
            if (rulingMap[ruling.oracle_id] == null) {
                rulingMap[ruling.oracle_id] = [];
            }

            rulingMap[ruling.oracle_id].push(ruling);

            count += 1;
        }

        total = Object.keys(rulingMap).length;
        count = 0;

        for (const pairs of chunk(Object.entries(rulingMap), chunkSize)) {
            // eslint-disable-next-line no-loop-func
            await Promise.all(pairs.map(async ([id, data]) => {
                await assignRuling(id, data, cardNames);

                count += 1;
            }));
        }
    }

    stopImpl(): void { /* no-op */ }
}
