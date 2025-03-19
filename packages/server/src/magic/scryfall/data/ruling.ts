import Task from '@/common/task';

import Card from '@/magic/db/card';
import Ruling from '@/magic/db/ruling';

import { Ruling as IRuling } from '@interface/magic/ruling';
import { RawRuling } from '@interface/magic/scryfall/card';

import LineReader from '@/common/line-reader';
import CardNameExtractor from '@/magic/extract-name';

import { Status } from '../status';

import { join } from 'path';
import internalData from '@/internal-data';
import { convertJson, bulkPath } from './common';

export type SpellingMistakes = {
    cardId:     string;
    text:       string;
    correction: string;
}[];

export default class RulingLoader extends Task<Status> {
    file:       string;
    filePath:   string;
    lineReader: LineReader;

    init(fileName: string): void {
        this.file = fileName;
        this.filePath = join(bulkPath, `${fileName}.json`);
        this.lineReader = new LineReader(this.filePath);
    }

    async startImpl(): Promise<void> {
        const cardNames = await CardNameExtractor.names();
        const spellingMistakes = internalData<SpellingMistakes>('magic.rulings.spelling-mistakes');

        let method = 'load';
        let total = 0;
        let count = 0;

        // start timer
        let start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method,
                type: 'ruling',

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

        await Ruling.deleteMany({});

        const rawRulings: RawRuling[] = [];
        const oracleIds = new Set<string>();

        for await (const ruling of convertJson<RawRuling>(this.lineReader.get())) {
            rawRulings.push(ruling);
            oracleIds.add(ruling.oracle_id);

            count += 1;
        }

        const cards = await Card.find({ 'scryfall.oracleId': { $in: Array.from(oracleIds) } });

        method = 'assign';
        total = rawRulings.length;
        count = 0;

        for (const rawRuling of rawRulings) {
            const matchCards = cards.filter(c => c.scryfall.oracleId.includes(rawRuling.oracle_id));

            if (matchCards.length !== 1) {
                console.log(`No unique card with oracle id ${rawRuling.oracle_id} found. Skipping...`);
                continue;
            }

            const card = matchCards[0];

            let text = rawRuling.comment;

            for (const m of spellingMistakes) {
                if (m.cardId === card.cardId) {
                    text = text.replaceAll(m.text, m.correction);
                }
            }

            const cardsInText = new CardNameExtractor({
                text,
                cardNames,
                thisName: { id: card.cardId, name: card.parts.map(p => p.name) },
            }).extract();

            const ruling: IRuling = {
                cardId: card.cardId,
                source: rawRuling.source,
                date:   rawRuling.published_at,
                text,
                cards:  cardsInText,
            };

            await Ruling.create(ruling);

            count += 1;
        }
    }

    stopImpl(): void { /* no-op */ }
}
