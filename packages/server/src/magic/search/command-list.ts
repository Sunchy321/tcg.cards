import { cs as create } from '@/search/command';

import * as builtin from '@/search/command/builtin';
import * as magic from './command';

import { QueryError } from '@search/command/error';

import { and, arrayContains, asc, desc, eq, gt, gte, inArray, lt, lte, ne, not, notInArray, or, SQL, sql } from 'drizzle-orm';

import { toIdentifier } from '@common/util/id';
import internalData from '@/internal-data';

import { model } from '@model/magic/search';
import { CardEditorView, CardPrintView } from '../schema/print';

import { commaRegex, parenRegex } from '@static/magic/special';

const cs = create
    .with(model)
    .table([CardPrintView, CardEditorView])
    .use({ ...builtin, ...magic });

export const raw = cs
    .commands.raw
    .handler(({ value }, { table }) => {
        // search mana
        if (typeof value === 'string' && /^(\{[^}]+\})+$/.test(value)) {
            return or(
                builtin.text.call({
                    column: table => table.cardPart.text,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardPartLocalization.text,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
                magic.cost.call({
                    column: table => table.cardPart.cost,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { getCostMapCol: otherTable => (otherTable as typeof table).cardPart.cost }, table },
                }),
            )!;
        } else {
            return or(
                builtin.text.call({
                    column: table => table.cardPart.name,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardPartLocalization.name,
                    args:   { value, operator: ':', qualifier: [] },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        }
    });

export const stats = cs
    .commands.stats
    .handler(({ pattern, operator, qualifier }, { table }) => {
        if (operator === '') {
            operator = '=';
        }

        const { power, toughness } = pattern;

        if (qualifier?.includes('!')) {
            return or(
                magic.numeric.call({
                    column: table => table.cardPart.power,
                    args:   { value: power, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
                magic.numeric.call({
                    column: table => table.cardPart.toughness,
                    args:   { value: toughness, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
            )!;
        } else {
            return and(
                magic.numeric.call({
                    column: table => table.cardPart.power,
                    args:   { value: power, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
                magic.numeric.call({
                    column: table => table.cardPart.toughness,
                    args:   { value: toughness, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
            )!;
        }
    });

export const hash = cs
    .commands.hash
    .handler(({ value, pattern, qualifier }, { table }) => {
        const tag = pattern?.tag ?? value;

        if (tag === 'dev:paren') {
            const withParen = internalData<string[]>('magic.special.with-paren');

            if (!qualifier.includes('!')) {
                return and(
                    notInArray(table.cardId, withParen),
                    sql`regexp_like(${table.cardPartLocalization.text}, ${parenRegex.source})`,
                    sql`not(${table.cardPart.typeMain} && ARRAY['dungeon', 'card'])`,
                )!;
            } else {
                return or(
                    inArray(table.cardId, withParen),
                    sql`not regexp_like(${table.cardPartLocalization.text}, ${parenRegex.source})`,
                    sql`${table.cardPart.typeMain} && ARRAY['dungeon', 'card']`,
                )!;
            }
        }

        if (tag === 'dev:keyword') {
            const withComma = internalData<string[]>('magic.special.with-comma');

            if (!qualifier.includes('!')) {
                return and(
                    notInArray(table.cardId, withComma),
                    sql`regexp_like(${table.cardPartLocalization.text}, ${commaRegex.source}, 'm')`,
                    sql`not(${table.cardPart.typeMain} && ARRAY['dungeon', 'stickers', 'card'])`,
                )!;
            } else {
                return or(
                    inArray(table.cardId, withComma),
                    sql`not regexp_like(${table.cardPartLocalization.text}, ${commaRegex.source}, 'm')`,
                    sql`${table.cardPart.typeMain} && ARRAY['dungeon', 'stickers', 'card']`,
                )!;
            }
        }

        if (!qualifier.includes('!')) {
            return or(
                arrayContains(table.card.tags, [tag]),
                arrayContains(table.print.printTags, [tag]),
            )!;
        } else {
            return and(
                not(arrayContains(table.card.tags, [tag])),
                not(arrayContains(table.print.printTags, [tag])),
            )!;
        }
    });

export const set = cs
    .commands.set
    .apply(table => table.set, {});

export const number = cs
    .commands.number
    .apply(table => table.number, {});

export const lang = cs
    .commands.lang
    .handler(({ value, operator, qualifier }, { table }) => {
        if (!qualifier.includes('!')) {
            return or(
                builtin.simple.call({
                    column: table => table.locale,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
                builtin.simple.call({
                    column: table => table.lang,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
            )!;
        } else {
            return and(
                builtin.simple.call({
                    column: table => table.locale,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
                builtin.simple.call({
                    column: table => table.lang,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: {}, table },
                }),
            )!;
        }
    });

export const manaCost = cs
    .commands.manaCost
    .apply(table => table.cardPart.cost, {
        getCostMapCol: table => (table as any).cardPart.cost,
    });

export const manaValue = cs
    .commands.manaValue
    .apply(table => table.card.manaValue, {});

export const color = cs
    .commands.color
    .apply(table => table.cardPart.color, {});

export const colorIdentity = cs
    .commands.colorIdentity
    .apply(table => table.card.colorIdentity, {});

export const colorIndicator = cs
    .commands.colorIndicator
    .apply(table => table.cardPart.colorIndicator, {});

export const power = cs
    .commands.power
    .apply(table => table.cardPart.power, {});

export const toughness = cs
    .commands.toughness
    .apply(table => table.cardPart.toughness, {});

export const loyalty = cs
    .commands.loyalty
    .handler(({ pattern, value, operator, qualifier }, { table }) => {
        return magic.numeric.call({
            column: table => table.cardPart.name,
            args:   {
                value:    pattern?.loyalty ?? value,
                operator: operator === '' ? '=' : operator,
                qualifier,
            },
            ctx: { meta: { multiline: false }, table },
        });
    });

export const defense = cs
    .commands.defense
    .handler(({ pattern, value, operator, qualifier }, { table }) => {
        return magic.numeric.call({
            column: table => table.cardPart.defense,
            args:   {
                value:    pattern?.defense ?? value,
                operator: operator === '' ? '=' : operator,
                qualifier,
            },
            ctx: { meta: { multiline: false }, table },
        });
    });

export const name = cs
    .commands.name
    .handler(({ value, modifier, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'oracle':
            return builtin.text.call({
                column: table => table.cardPart.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        case 'unified':
            return builtin.text.call({
                column: table => table.cardPartLocalization.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        case 'printed':
            return builtin.text.call({
                column: table => table.printPart.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.cardPart.name,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardPartLocalization.name,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        }
    });

export const type = cs
    .commands.type
    .handler(({ value, modifier, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'oracle':
            return builtin.text.call({
                column: table => table.cardPart.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        case 'unified':
            return builtin.text.call({
                column: table => table.cardPartLocalization.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        case 'printed':
            return builtin.text.call({
                column: table => table.printPart.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.cardPart.typeline,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
                builtin.text.call({
                    column: table => table.cardPartLocalization.typeline,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: false }, table },
                }),
            )!;
        }
    });

export const text = cs
    .commands.text
    .handler(({ value, modifier, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'oracle':
            return builtin.text.call({
                column: table => table.cardPart.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        case 'unified':
            return builtin.text.call({
                column: table => table.cardPartLocalization.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        case 'printed':
            return builtin.text.call({
                column: table => table.printPart.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        default:
            return (!qualifier.includes('!') ? or : and)(
                builtin.text.call({
                    column: table => table.cardPart.text,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: true }, table },
                }),
                builtin.text.call({
                    column: table => table.cardPartLocalization.text,
                    args:   { value, operator, qualifier },
                    ctx:    { meta: { multiline: true }, table },
                }),
            )!;
        }
    });

export const oracle = cs
    .commands.oracle
    .handler(({ value, operator, qualifier }, { table }) => {
        return (!qualifier.includes('!') ? or : and)(
            builtin.text.call({
                column: table => table.cardPart.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            }),
            builtin.text.call({
                column: table => table.cardPartLocalization.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            }),
        )!;
    });

export const flavorText = cs
    .commands.flavorText
    .apply(table => table.printPart.flavorText, { multiline: true });

export const flavorName = cs
    .commands.flavorName
    .apply(table => table.printPart.flavorName, { multiline: false });

export const layout = cs
    .commands.layout
    .apply(table => table.print.layout, {});

export const imageStatus = cs
    .commands.imageStatus
    .apply(table => table.print.imageStatus, {});

export const imageType = cs
    .commands.imageType
    .apply(table => table.print.fullImageType, {});

export const rarity = cs
    .commands.rarity
    .handler(({ value, operator, qualifier }, { table }) => {
        const rarities = (
            {
                c: 'common',
                u: 'uncommon',
                r: 'rare',
                m: 'mythic',
                s: 'special',
            } as Record<string, string>
        )[value] ?? value;

        return builtin.simple.call({
            column: table => table.cardPart.text,
            args:   { value: rarities, operator, qualifier },
            ctx:    { meta: { }, table },
        });
    });

export const date = cs
    .commands.date
    .handler(({ value, operator, qualifier }, { table }) => {
        switch (operator) {
        case '=':
        case ':':
            if (!qualifier.includes('!')) {
                return eq(table.print.releaseDate, value);
            } else {
                return ne(table.print.releaseDate, value);
            }
        case '>':
            return gt(table.print.releaseDate, value);
        case '>=':
            return gte(table.print.releaseDate, value);
        case '<':
            return lt(table.print.releaseDate, value);
        case '<=':
            return lte(table.print.releaseDate, value);
        default:
            throw new QueryError({ type: 'invalid-query' });
        }
    });

export const format = cs
    .commands.format
    .handler(({ value, qualifier }, { table }) => {
        if (value.includes(',')) {
            const [format, status] = value.split('=');

            if (!qualifier.includes('!')) {
                return eq(sql`${table.card.legalities} ->> ${format}`, status);
            } else {
                return ne(sql`${table.card.legalities} ->> ${format}`, status);
            }
        } else {
            if (!qualifier.includes('!')) {
                return inArray(sql`${table.card.legalities} ->> ${value}`, ['legal', 'restricted']);
            } else {
                return notInArray(sql`${table.card.legalities} ->> ${value}`, ['legal', 'restricted']);
            }
        }
    });

export const counter = cs
    .commands.counter
    .handler(({ value, qualifier }, { table }) => {
        value = toIdentifier(value);

        if (!qualifier.includes('!')) {
            return arrayContains(table.card.counters, [value]);
        } else {
            return not(arrayContains(table.card.counters, [value]));
        }
    });

export const keyword = cs
    .commands.keyword
    .handler(({ value, qualifier }, { table }) => {
        value = toIdentifier(value);

        if (!qualifier.includes('!')) {
            return arrayContains(table.card.keywords, [value]);
        } else {
            return not(arrayContains(table.card.keywords, [value]));
        }
    });

export const multiverseId = cs
    .commands.multiverseId
    .apply(table => table.print.multiverseId, {});

export const order = cs
    .commands.order
    .action('order-by', ({ value }, { table }) => {
        const parts = value.toLowerCase().split(',').map(v => {
            if (v.endsWith('+')) {
                return { type: v.slice(0, -1), dir: 1 as const };
            }

            if (v.endsWith('-')) {
                return { type: v.slice(0, -1), dir: -1 as const };
            }

            return { type: v, dir: 1 as const };
        });

        const sorter: SQL[] = [];

        for (const { type, dir } of parts) {
            const func = dir === 1 ? asc : desc;

            switch (type) {
            case 'name':
                sorter.push(func(table.card.name));
                break;
            case 'set':
            case 'number':
                sorter.push(func(table.set));
                // Natural sort: sort by numeric part as integer first, then by alphabetic suffix
                sorter.push(func(sql`(
                    CASE
                        WHEN ${table.number} ~ '^[0-9]+'
                        THEN regexp_replace(${table.number}, '[^0-9].*$', '')::int
                        ELSE 0
                    END
                )`));
                sorter.push(func(sql`regexp_replace(${table.number}, '^[0-9]+', '')`));
                break;
            case 'date':
                sorter.push(func(table.print.releaseDate));
                break;
            case 'id':
                sorter.push(func(table.cardId));
                break;
            case 'cmc':
            case 'mv':
            case 'cost':
                sorter.push(func(table.card.manaValue));
                break;
            case 'color':
                // Sort by color: colorless non-land non-artifact -> WUBRG monocolor -> multicolor -> artifact -> land
                // Count the number of '1' bits in the color field to determine color count
                sorter.push(func(sql`(
                    CASE
                        -- Land (priority 5)
                        WHEN 'Land' = ANY(${table.cardPart.typeMain}) THEN 5
                        -- Artifact (priority 4)
                        WHEN 'Artifact' = ANY(${table.cardPart.typeMain}) THEN 4
                        -- Multicolor (priority 3): more than one '1' bit
                        WHEN length(replace(${table.cardPart.color}::text, '0', '')) > 1 THEN 3
                        -- Monocolor (priority 2): exactly one '1' bit
                        WHEN length(replace(${table.cardPart.color}::text, '0', '')) = 1 THEN 2
                        -- Colorless non-land non-artifact (priority 1)
                        ELSE 1
                    END
                )`));
                // For monocolor cards, sort by WUBRG order
                // W=bit 0, U=bit 1, B=bit 2, R=bit 3, G=bit 4
                sorter.push(func(sql`(
                    CASE
                        WHEN substring(${table.cardPart.color}::text, 1, 1) = '1' THEN 1  -- W
                        WHEN substring(${table.cardPart.color}::text, 2, 1) = '1' THEN 2  -- U
                        WHEN substring(${table.cardPart.color}::text, 3, 1) = '1' THEN 3  -- B
                        WHEN substring(${table.cardPart.color}::text, 4, 1) = '1' THEN 4  -- R
                        WHEN substring(${table.cardPart.color}::text, 5, 1) = '1' THEN 5  -- G
                        ELSE 6
                    END
                )`));
                break;
            default:
                throw new QueryError({ type: 'invalid-query' });
            }
        }

        return sorter;
    });
