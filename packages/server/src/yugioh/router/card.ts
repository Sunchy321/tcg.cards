import { ORPCError, os } from '@orpc/server';

import _ from 'lodash';
import z from 'zod';

import { and, eq, desc, asc } from 'drizzle-orm';

import { mainLocale, locale } from '@model/yugioh/schema/basic';
import { cardProfile, cardView } from '@model/yugioh/schema/card';
import { cardFullView } from '@model/yugioh/schema/print';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardView } from '../schema/card';
import { Print, CardPrintView } from '../schema/print';

// random
const random = os
    .route({
        method:      'GET',
        description: 'Get random card ID',
        tags:        ['Yugioh', 'Card'],
    })
    .input(z.any())
    .output(z.string())
    .handler(async () => {
        const cards = await db.select({ cardId: Card.cardId }).from(Card);
        const cardId = cards[_.random(0, cards.length - 1)].cardId;
        return cardId;
    });

// summary
const summary = os
    .route({
        method:      'GET',
        description: 'Get card by ID',
        tags:        ['Yugioh', 'Card'],
    })
    .input(z.object({
        cardId: z.string().describe('Card ID'),
        lang:   mainLocale.default('en').describe('Language of the card'),
    }))
    .output(cardView)
    .handler(async ({ input }) => {
        const { cardId, lang } = input;

        const raw = await db.select()
            .from(CardView)
            .where(and(
                eq(CardView.cardId, cardId),
                eq(CardView.lang, lang),
            ))
            .then(rows => rows[0]);

        if (raw == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const { localization, cardId: id, lang: rawLang, ...cardFlat } = raw as any;

        return {
            cardId:           id,
            lang:             rawLang,
            card:             cardFlat,
            cardLocalization: localization,
        } as z.infer<typeof cardView>;
    });

// summary by name
const summaryByName = os
    .input(z.object({
        name: z.string(),
        lang: mainLocale.default('en'),
    }))
    .output(cardView.array())
    .handler(async ({ input }) => {
        const { name, lang } = input;

        const raws = await db.select().from(CardView)
            .where(and(
                eq(CardView.localization.name, name),
                eq(CardView.lang, lang),
            ));

        if (raws.length === 0) {
            throw new ORPCError('NOT_FOUND');
        }

        return raws.map(r => {
            const { localization, cardId: id, lang: rawLang, ...cardFlat } = r as any;
            return {
                cardId:           id,
                lang:             rawLang,
                card:             cardFlat,
                cardLocalization: localization,
            };
        });
    });

// profile
const profile = os
    .input(z.string())
    .output(cardProfile)
    .handler(async ({ input }) => {
        const cardId = input;

        const card = await db.select().from(Card)
            .where(eq(Card.cardId, cardId))
            .limit(1)
            .then(rows => rows[0]);

        if (card == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const cardLocalizations = await db.select({
            lang: CardLocalization.lang,
            name: CardLocalization.name,
        }).from(CardLocalization).where(eq(CardLocalization.cardId, cardId));

        const versions = await db.select({
            lang:   Print.lang,
            set:    Print.set,
            number: Print.number,
            rarity: Print.rarity,
        }).from(Print).where(eq(Print.cardId, cardId));

        return {
            cardId,
            localization: cardLocalizations,
            passcode:     card.passcode,
            versions,
        };
    });

const fuzzy = os
    .route({ method: 'GET' })
    .input(z.object({
        cardId: z.string(),
        lang:   locale,
        set:    z.string().optional(),
        number: z.string().optional(),
    }))
    .output(cardFullView)
    .handler(async ({ input }) => {
        const { cardId, lang, set, number } = input;

        const fullViews = await db.select()
            .from(CardPrintView)
            .where(eq(CardPrintView.cardId, cardId))
            .orderBy(desc(CardPrintView.print.releaseDate), asc(CardPrintView.lang));

        const cardPrint = (() => {
            if (set != null && number != null) {
                const exact = fullViews.find(v => v.lang === lang && v.set === set && v.number === number);
                if (exact) return exact;
                const setNumber = fullViews.find(v => v.set === set && v.number === number);
                if (setNumber) return setNumber;
            }
            if (set != null) {
                const langSet = fullViews.find(v => v.lang === lang && v.set === set);
                if (langSet) return langSet;
                const setOnly = fullViews.find(v => v.set === set);
                if (setOnly) return setOnly;
            }
            if (number != null) {
                const langNumber = fullViews.find(v => v.lang === lang && v.number === number);
                if (langNumber) return langNumber;
                const numberOnly = fullViews.find(v => v.number === number);
                if (numberOnly) return numberOnly;
            }
            const langOnly = fullViews.find(v => v.lang === lang);
            if (langOnly) return langOnly;
            return fullViews[0];
        })();

        if (cardPrint == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const versions = await db.select({
            set:    Print.set,
            number: Print.number,
            lang:   Print.lang,
            rarity: Print.rarity,
        }).from(Print).where(eq(Print.cardId, cardId)).orderBy(desc(Print.releaseDate));

        return {
            ...cardPrint,
            versions,
            relatedCards: [],
            rulings:      [], // TODO: 裁定后续补充
        };
    });

export const cardTrpc = {
    random,
    summary,
    summaryByName,
    profile,
    fuzzy,
};

export const cardApi = {
    '': summary,
    random,
};
