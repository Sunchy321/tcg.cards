import { ORPCError, os } from '@orpc/server';

import z from 'zod';
import _ from 'lodash';
import { and, asc, desc, eq, getTableColumns, like, not, notInArray, sql } from 'drizzle-orm';

import { formats as formatList, Locale, locale } from '@model/magic/schema/basic';
import { cardProfile, cardView } from '@model/magic/schema/card';
import { CardEditorView as ICardEditorView, cardEditorView, cardFullView } from '@model/magic/schema/print';
import { legality } from '@model/magic/schema/game-change';

import CardNameExtractor from '../extract-name';

import { db } from '@/drizzle';
import { Card, CardLocalization, CardPart, CardPartLocalization, CardView } from '../schema/card';
import { CardEditorView, Print, PrintPart } from '../schema/print';
import { CardPrintView } from '../schema/print';
import { Ruling } from '../schema/ruling';
import { CardRelation } from '../schema/card-relation';
import { Format } from '../schema/format';

import { generateText, Output } from 'ai';
import { createQwen } from 'qwen-ai-provider-v5';

import { getLegality as getLegalityAction, getLegalityRules, LegalityRecorder, lookupPrintsForLegality } from '../banlist/legality';

import internalData from '@/internal-data';
import { intoRichText } from '../util';

import { commaRegex, parenRegex } from '@static/magic/special';

const random = os
    .route({
        method:      'GET',
        description: 'Get random card ID',
        tags:        ['Magic', 'Card'],
    })
    .input(z.any())
    .output(z.string())
    .handler(async () => {
        const cards = await db.select({ cardId: Card.cardId }).from(Card);
        const cardId = cards[_.random(0, cards.length - 1)].cardId;

        return cardId;
    });

const summary = os
    .route({
        method:      'GET',
        description: 'Get card by ID',
        tags:        ['Magic', 'Card'],
    })
    .input(z.object({
        cardId:    z.string().describe('Card ID'),
        lang:      locale.default('en').describe('Language of the card'),
        partIndex: z.int().min(0).default(0).describe('Part index of the card, if it has multiple parts (e.g. split cards)'),
    }))
    .output(cardView)
    .handler(async ({ input }) => {
        const { cardId, lang, partIndex } = input;

        const view = await db.select()
            .from(CardView)
            .where(and(
                eq(CardView.cardId, cardId),
                eq(CardView.lang, lang),
                eq(CardView.partIndex, partIndex),
            ))
            .then(rows => rows[0]);

        if (view == null) {
            throw new ORPCError('NOT_FOUND');
        }

        return view;
    });

const fuzzy = os
    .route({
        method: 'GET',
    })
    .input(z.object({
        cardId:    z.string(),
        lang:      locale,
        set:       z.string().optional(),
        number:    z.string().optional(),
        partIndex: z.string().transform(v => Number.parseInt(v, 10) || 0).pipe(z.int()).optional(),
    }))
    .output(cardFullView)
    .handler(async ({ input }) => {
        const { cardId, lang, set, number, partIndex } = input;

        const fullViews = await db.select()
            .from(CardPrintView)
            .where(and(
                eq(CardPrintView.cardId, cardId),
                eq(CardPrintView.partIndex, partIndex ?? 0),
            ))
            .orderBy(desc(CardPrintView.print.releaseDate), asc(CardPrintView.lang));

        const cardPrint = (() => {
            if (set != null && number != null) {
                const exact = fullViews.find(view => view.lang === lang && view.set === set && view.number === number);

                if (exact != null) {
                    return exact;
                }

                const setNumber = fullViews.find(view => view.set === set && view.number === number);

                if (setNumber != null) {
                    return setNumber;
                }
            }

            if (set != null) {
                const langSet = fullViews.find(view => view.lang === lang && view.set === set);

                if (langSet != null) {
                    return langSet;
                }

                const setOnly = fullViews.find(view => view.set === set);

                if (setOnly != null) {
                    return setOnly;
                }
            };

            if (number != null) {
                const langNumber = fullViews.find(view => view.lang === lang && view.number === number);

                if (langNumber != null) {
                    return langNumber;
                }

                const numberOnly = fullViews.find(view => view.number === number);

                if (numberOnly != null) {
                    return numberOnly;
                }
            }

            const langOnly = fullViews.find(view => view.lang === lang);

            if (langOnly != null) {
                return langOnly;
            }

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

        const rulings = await db.select({
            ..._.omit(getTableColumns(Ruling), 'id'),
        }).from(Ruling).where(eq(Ruling.cardId, cardId));

        const sourceRelation = await db.select({
            relation: CardRelation.relation,
            cardId:   CardRelation.targetId,
        }).from(CardRelation).where(eq(CardRelation.sourceId, cardId));

        const targetRelation = await db.select({
            relation: sql<string>`'source'`.as('relation'),
            cardId:   CardRelation.sourceId,
        }).from(CardRelation).where(eq(CardRelation.targetId, cardId));

        const relatedCards = [...sourceRelation, ...targetRelation];

        return {
            ...cardPrint,
            versions,
            rulings,
            relatedCards,
        };
    });

const profile = os
    .input(z.string())
    .output(cardProfile)
    .handler(async ({ input }) => {
        const cardId = input;

        const cardLocalizations = await db.select({
            lang: CardLocalization.lang,
            name: CardLocalization.name,
        }).from(CardLocalization).where(eq(CardLocalization.cardId, cardId));

        if (cardLocalizations.length === 0) {
            throw new ORPCError('NOT_FOUND');
        }

        const versions = await db.select({
            lang:          Print.lang,
            set:           Print.set,
            number:        Print.number,
            rarity:        Print.rarity,
            layout:        Print.layout,
            fullImageType: Print.fullImageType,
            releaseDate:   Print.releaseDate,
        }).from(Print).where(eq(Print.cardId, cardId));

        return {
            cardId,
            localization: cardLocalizations,
            versions,
        };
    });

const editorView = os
    .input(z.object({
        cardId:    z.string(),
        lang:      locale,
        set:       z.string(),
        number:    z.string(),
        partIndex: z.int().min(0).default(0),
    }))
    .output(cardEditorView)
    .handler(async ({ input }) => {
        const { cardId, lang, set, number, partIndex } = input;

        const view = await db.select()
            .from(CardEditorView)
            .where(and(
                eq(CardEditorView.cardId, cardId),
                eq(CardEditorView.lang, lang),
                eq(CardEditorView.set, set),
                eq(CardEditorView.number, number),
                eq(CardEditorView.partIndex, partIndex),
            ))
            .then(rows => rows[0]);

        const sourceRelation = await db.select({
            relation: CardRelation.relation,
            cardId:   CardRelation.targetId,
        }).from(CardRelation).where(eq(CardRelation.sourceId, cardId));

        const targetRelation = await db.select({
            relation: sql<string>`'source'`.as('relation'),
            cardId:   CardRelation.sourceId,
        }).from(CardRelation).where(eq(CardRelation.targetId, cardId));

        const relatedCards = [...sourceRelation, ...targetRelation];

        return {
            ...view,
            relatedCards,
        };
    });

const paren = (lang: Locale | undefined, select: any) => {
    return db.selectDistinctOn([CardEditorView.cardId, CardEditorView.lang], select)
        .from(CardEditorView)
        .where(and(
            notInArray(CardEditorView.cardId, internalData<string[]>('magic.special.with-paren')),
            sql`regexp_like(${CardEditorView.cardPartLocalization.text}, ${parenRegex.source})`,
            sql`not(${CardEditorView.cardPart.typeMain} && ARRAY['dungeon', 'card'])`,
            ...lang != null ? [eq(CardEditorView.lang, lang)] : [],
        ))
        .orderBy(CardEditorView.cardId, CardEditorView.lang, desc(CardEditorView.print.releaseDate));
};

const keyword = (lang: Locale | undefined, select: any) => {
    return db.selectDistinctOn([CardEditorView.cardId, CardEditorView.lang], select)
        .from(CardEditorView)
        .where(and(
            notInArray(CardEditorView.cardId, internalData<string[]>('magic.special.with-comma')),
            sql`regexp_like(${CardEditorView.cardPartLocalization.text}, ${commaRegex.source}, 'm')`,
            sql`not(${CardEditorView.cardPart.typeMain} && ARRAY['dungeon', 'stickers', 'card'])`,
            ...lang != null ? [eq(CardEditorView.lang, lang)] : [],
        ))
        .orderBy(CardEditorView.cardId, CardEditorView.lang, desc(CardEditorView.print.releaseDate));
};

const token = (_lang: Locale | undefined, select: any) => {
    return db.select(select)
        .from(CardEditorView)
        .where(and(
            not(like(CardEditorView.cardId, '%!%')),
            sql`${CardEditorView.cardPart.typeSuper} && ARRAY['token']`,
        ));
};

const needEditGetters: Record<'paren' | 'keyword' | 'token', (lang?: Locale, select?: any) => ReturnType<typeof paren>> = {
    paren,
    keyword,
    token,
};

const needEdit = os
    .input(z.object({
        method: z.enum(['paren', 'keyword', 'token']),
        lang:   locale.optional(),
        sample: z.number().min(1).max(100).default(50),
    }))
    .output(z.object({
        method: z.string(),
        result: cardEditorView.array(),
        total:  z.int().min(0),
    }))
    .handler(async ({ input }) => {
        const startTime = Date.now();
        const { method, lang, sample } = input;

        const getter = needEditGetters[method];

        if (getter == null) {
            throw new ORPCError('INVALID_ARGUMENT');
        }

        const subquery = getter(lang).as('subquery');

        const result = await db.select()
            .from(subquery)
            .orderBy(desc(sql`release_date`))
            .limit(sample) as ICardEditorView[];

        const resultTime = Date.now();
        console.log(`needEdit [${method}] - result fetched: ${resultTime - startTime}ms`);

        const totalResult = await db.select({ count: sql<number>`count(*)`.as('count') })
            .from(subquery);

        const total = Number(totalResult[0]?.count ?? 0);

        const endTime = Date.now();
        const duration = endTime - startTime;

        console.log(`needEdit [${method}] - total: ${total}, duration: ${duration}ms`);

        return { method, result, total };
    });

const update = os
    .input(cardEditorView)
    .output(z.void())
    .handler(async ({ input }) => {
        const {
            cardId,
            lang,
            set,
            number,
            partIndex,

            card,
            cardLocalization,
            cardPart,
            cardPartLocalization,
            print,
            printPart,
            relatedCards,
        } = input;

        if (printPart.flavorText === '') {
            printPart.flavorText = null;
        }

        if (printPart.flavorName === '') {
            printPart.flavorName = null;
        }

        await db.transaction(async tx => {
            await tx.insert(Card)
                .values({ cardId, ...card })
                .onConflictDoUpdate({
                    target: Card.cardId,
                    set:    card,
                });

            await tx.insert(CardLocalization)
                .values({ cardId, lang, ...cardLocalization })
                .onConflictDoUpdate({
                    target: [CardLocalization.cardId, CardLocalization.lang],
                    set:    cardLocalization,
                });

            await tx.insert(CardPart)
                .values({ cardId, partIndex, ...cardPart })
                .onConflictDoUpdate({
                    target: [CardPart.cardId, CardPart.partIndex],
                    set:    cardPart,
                });

            await tx.insert(CardPartLocalization)
                .values({ cardId, lang, partIndex, ...cardPartLocalization })
                .onConflictDoUpdate({
                    target: [CardPartLocalization.cardId, CardPartLocalization.lang, CardPartLocalization.partIndex],
                    set:    cardPartLocalization,
                });

            await tx.insert(Print)
                .values({ cardId, lang, set, number, ...print })
                .onConflictDoUpdate({
                    target: [Print.cardId, Print.lang, Print.set, Print.number],
                    set:    print,
                });

            await tx.insert(PrintPart)
                .values({ cardId, lang, set, number, partIndex, ...printPart })
                .onConflictDoUpdate({
                    target: [PrintPart.cardId, PrintPart.lang, PrintPart.set, PrintPart.number, PrintPart.partIndex],
                    set:    printPart,
                });

            if (relatedCards != null) {
                const relations = relatedCards
                    .filter(r => r.relation !== 'source')
                    .map(rc => ({
                        relation:     rc.relation,
                        sourceId:     cardId,
                        targetId:     rc.cardId,
                        targetSet:    rc.version?.set,
                        targetNumber: rc.version?.number,
                        targetLang:   rc.version?.lang,
                    }));

                // Delete existing relations for this card
                await tx.delete(CardRelation)
                    .where(eq(CardRelation.sourceId, cardId));

                // Insert new relations
                if (relations.length > 0) {
                    await tx.insert(CardRelation)
                        .values(relations);
                }
            }
        });
    });

const getLegality = os
    .input(z.string())
    .output(z.record(z.string(), z.object({
        result: legality,
        reason: z.string(),
    })))
    .handler(async ({ input }) => {
        const cardId = input;

        const formats = await db.select()
            .from(Format)
            .then(rows => rows.sort((a, b) => formatList.indexOf(a.formatId) - formatList.indexOf(b.formatId)));

        const rules = getLegalityRules();

        const view = await lookupPrintsForLegality()
            .where(eq(Card.cardId, cardId))
            .then(rows => rows[0]);

        const recorder: LegalityRecorder = {};

        const legalities = getLegalityAction(view, formats, rules, recorder);

        await db.update(Card)
            .set({ legalities })
            .where(eq(Card.cardId, cardId));

        return recorder;
    });

const extractRulingCards = os
    .input(z.string())
    .output(z.strictObject({
        cardId: z.string(),
        text:   z.string(),
        part:   z.int().min(0).optional(),
    }).array().array())
    .handler(async ({ input }) => {
        const cardId = input;

        const cardNames = await CardNameExtractor.names();

        const card = await db.select()
            .from(Card)
            .where(eq(Card.cardId, cardId))
            .then(rows => rows[0]);

        if (card == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const cardParts = await db.select()
            .from(CardPart)
            .where(eq(CardPart.cardId, cardId))
            .orderBy(asc(CardPart.partIndex));

        const rulings = await db.select()
            .from(Ruling)
            .where(eq(Ruling.cardId, cardId));

        const extractor = new CardNameExtractor({
            cardNames,

            thisName: { id: card.cardId, name: [card.name, ...cardParts.map(p => p.name)] },
        });

        const cards = [];

        for (const ruling of rulings) {
            const cardsInText = extractor.extract(ruling.text);

            cards.push(cardsInText);

            const richText = intoRichText(ruling.text, cardsInText);

            await db.update(Ruling)
                .set({ richText })
                .where(eq(Ruling.id, ruling.id));
        }

        return cards;
    });

const assetBase = 'https://asset.tcg.cards';

const scanCardText = os
    .input(z.object({
        set:       z.string(),
        number:    z.string(),
        lang:      locale.default('en'),
        layout:    z.string(),
        partIndex: z.int().min(0).default(0),
    }))
    .output(z.any())
    .handler(async ({ input }) => {
        const { set, number, lang, layout, partIndex } = input;

        const print = await db.select({
            fullImageType: Print.fullImageType,
        })
            .from(Print)
            .where(and(
                eq(Print.set, set),
                eq(Print.number, number),
                eq(Print.lang, lang),
            ))
            .then(rows => rows[0]);

        if (print == null) {
            throw new ORPCError('NOT_FOUND');
        }

        const ext = print.fullImageType;

        const urls = (() => {
            if ([
                'transform',
                'modal_dfc',
                'transform_token',
                'minigame',
                'reversible_card',
                'double_faced',
                'battle',
                'art_series',
            ].includes(layout)) {
                return [
                    `${assetBase}/magic/card/large/${set}/${lang}/${number}-0.${ext}`,
                    `${assetBase}/magic/card/large/${set}/${lang}/${number}-1.${ext}`,
                ];
            } else if (['flip_token_top', 'flip_token_bottom'].includes(layout)) {
                return [
                    `${assetBase}/magic/card/large/${set}/${lang}/${number.split('-')[0]}.${ext}`,
                ];
            } else {
                return [
                    `${assetBase}/magic/card/large/${set}/${lang}/${number}.${ext}`,
                ];
            }
        })();

        const url = urls[partIndex] ?? urls[0];

        const qwen = createQwen({ baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1' });

        console.log(url);

        const { output } = await generateText({
            model:  qwen('qwen-vl-max') as any,
            output: Output.object({
                schema: z.object({
                    name:       z.string(),
                    typeline:   z.string(),
                    text:       z.string(),
                    flavorText: z.string(),
                }),
            }),
            messages: [
                {
                    role:    'user',
                    content: [
                        {
                            type:      'file',
                            mediaType: `image/${ext}`,
                            data:      url,
                        },
                        {
                            type: 'text',
                            text: '请提取图像中的卡牌名称、卡牌类别、效果文本和风味文字，模糊或者无法识别的符号或图标用{?}代替。名称为图片最上方的文本。类别为图片中间位置的文本。效果文本和风味文字为图片下方的文本，其中风味文字使用不同的字体。多行文本不应超过一个换行符。返回数据格式以json方式输出，格式为：{ name: \'xxx\', typeline: \'xxx\', text: \'xxx\', flavorText: \'xxx\' }',
                        },
                    ],
                },
            ],

        });

        console.log('Extracted card data:', output);

        return output;
    });

export const cardTrpc = {
    random,
    fuzzy,
    profile,
    editorView,
    needEdit,
    update,
    getLegality,
    extractRulingCards,
    scanCardText,
};

export const cardApi = {
    '': summary,
    random,
};
