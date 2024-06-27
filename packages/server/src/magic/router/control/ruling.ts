/* eslint-disable @typescript-eslint/no-explicit-any */
import KoaRouter from '@koa/router';
import { DefaultState, Context } from 'koa';

import Card from '@/magic/db/card';
import Ruling from '@/magic/db/ruling';

import CardNameExtractor from '@/magic/extract-name';

import internalData from '@/internal-data';

import { SpellingMistakes } from '@/magic/scryfall/data/ruling';

const router = new KoaRouter<DefaultState, Context>();

router.prefix('/print');

router.get('/extract-cards', async ctx => {
    const cardNames = await CardNameExtractor.names();
    const spellingMistakes = internalData<SpellingMistakes>('magic.rulings.spelling-mistakes');

    const ids = (ctx.query.id ?? '') as string;

    for (const id of ids.split(',')) {
        const rulings = await Ruling.find({ cardId: id });

        if (rulings.length === 0) {
            continue;
        }

        const card = await Card.findOne({ cardId: id });

        if (card == null) {
            continue;
        }

        const oracleName = card.parts.map(p => p.name);

        for (const m of spellingMistakes) {
            if (m.cardId === id) {
                for (const r of rulings) {
                    r.text = r.text.replaceAll(m.text, m.correction);
                }
            }
        }

        const cardsList = [];

        for (const r of rulings) {
            const cards = new CardNameExtractor({
                text:     r.text,
                cardNames,
                thisName: { id, name: oracleName },
            }).extract();

            cardsList.push(cards);

            r.cards = [];

            await r.save();
        }

        ctx.body = cardsList;
    }
});

export default router;
