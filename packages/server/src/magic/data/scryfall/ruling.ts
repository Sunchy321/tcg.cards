import Task from '@/common/task';

import { db } from '@/drizzle';
import { Card, CardPart } from '@/magic/schema/card';
import { Ruling } from '@/magic/schema/ruling';

import { RawRuling } from '@model/magic/schema/data/scryfall/card';

import { Status } from './status';

import LineReader from '@/common/line-reader';
import CardNameExtractor from '@/magic/extract-name';

import { sql, asc } from 'drizzle-orm';
import { join } from 'path';
import internalData from '@/internal-data';
import { intoRichText } from '@/magic/util';
import { convertJson, bulkPath } from './common';

export type SpellingMistakes = {
    cardId:     string;
    text:       string;
    correction: string;
}[];

export class RulingLoader extends Task<Status> {
    file:       string;
    filePath:   string;
    lineReader: LineReader;

    constructor(fileName: string) {
        super();

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

        await db.delete(Ruling);

        const rawRulings: RawRuling[] = [];
        const oracleIds = new Set<string>();

        for await (const ruling of convertJson<RawRuling>(this.lineReader.get())) {
            rawRulings.push(ruling);
            oracleIds.add(ruling.oracle_id);

            count += 1;
        }

        const cards = await db.select().from(Card)
            .where(sql`${Card.scryfallOracleId} && ${sql.raw(`'{${Array.from(oracleIds).join(',')}}'`)}`);

        // Collect all card IDs and fetch card parts in one query
        const cardIds = cards.map(c => c.cardId);
        const allCardParts = await db.select().from(CardPart)
            .where(sql`${CardPart.cardId} = ANY(${sql.raw(`'{${cardIds.join(',')}}'`)})`)
            .orderBy(asc(CardPart.cardId), asc(CardPart.partIndex));

        // Create a map for quick lookup
        const cardPartsMap = new Map<string, typeof allCardParts>();
        for (const part of allCardParts) {
            if (!cardPartsMap.has(part.cardId)) {
                cardPartsMap.set(part.cardId, []);
            }
            cardPartsMap.get(part.cardId)!.push(part);
        }

        method = 'assign';
        total = rawRulings.length;
        count = 0;

        const extractor = new CardNameExtractor({ cardNames });

        for (const rawRuling of rawRulings) {
            const matchCards = cards.filter(c => c.scryfallOracleId.includes(rawRuling.oracle_id));

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

            // Get card parts from the pre-loaded map
            const cardParts = cardPartsMap.get(card.cardId) ?? [];

            extractor.thisName = { id: card.cardId, name: [card.name, ...cardParts.map(p => p.name)] };

            const cardsInText = extractor.extract(text);

            const richText = intoRichText(text, cardsInText);

            await db.insert(Ruling).values({
                cardId: card.cardId,
                source: rawRuling.source,
                date:   rawRuling.published_at,
                text,
                richText,
            });

            count += 1;
        }
    }

    stopImpl(): void { /* no-op */ }
}
