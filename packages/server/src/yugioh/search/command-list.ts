import { cs as create } from '@/search/command';

import * as builtin from '@/search/command/builtin';

import { QueryError } from '@search/command/error';

import { and, arrayContains, not, or } from 'drizzle-orm';

import { model } from '@model/yugioh/search';
import { CardEditorView, CardPrintView } from '../schema/print';

const cs = create
    .with(model)
    .table([CardPrintView, CardEditorView])
    .use({ ...builtin });

export const raw = cs
    .commands.raw
    .handler(({ value }, { table }) => {
        return builtin.text.call({
            column: table => table.cardLocalization.name,
            args:   { value, operator: ':', qualifier: [] },
            ctx:    { meta: { multiline: false }, table },
        });
    });

export const stats = cs
    .commands.stats
    .handler(({ pattern, operator, qualifier }, { table }) => {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        if (operator === '' || operator === ':') {
            operator = '=';
        }

        const { attack, defense } = pattern;

        if (!qualifier?.includes('!')) {
            return and(
                builtin.number.call({
                    column: table => table.card.attack,
                    args:   { value: attack, operator, qualifier },
                    ctx:    { meta: { allowFloat: false }, table },
                }),
                builtin.number.call({
                    column: table => table.card.defense,
                    args:   { value: defense, operator, qualifier },
                    ctx:    { meta: { allowFloat: false }, table },
                }),
            )!;
        } else {
            return or(
                builtin.number.call({
                    column: table => table.card.attack,
                    args:   { value: attack, operator, qualifier },
                    ctx:    { meta: { allowFloat: false }, table },
                }),
                builtin.number.call({
                    column: table => table.card.defense,
                    args:   { value: defense, operator, qualifier },
                    ctx:    { meta: { allowFloat: false }, table },
                }),
            )!;
        }
    });

export const hash = cs
    .commands.hash
    .handler(({ pattern, qualifier }, { table }) => {
        if (pattern == null) {
            throw new QueryError({ type: 'invalid-query' });
        }

        const { tag } = pattern;

        if (!qualifier.includes('!')) {
            return arrayContains(table.card.tags, [tag]);
        } else {
            return not(arrayContains(table.card.tags, [tag]));
        }
    });

export const set = cs.commands.set.simple(table => table.set);

export const number = cs.commands.number.simple(table => table.number);

export const lang = cs.commands.lang.simple(table => table.lang);

export const name = cs
    .commands.name
    .handler(({ modifier, value, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'unified':
            return builtin.text.call({
                column: table => table.cardLocalization.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        case 'printed':
            return builtin.text.call({
                column: table => table.print.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        default:
            return builtin.text.call({
                column: table => table.cardLocalization.name,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        }
    });

export const type = cs
    .commands.type
    .handler(({ modifier, value, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'unified':
            return builtin.text.call({
                column: table => table.cardLocalization.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        case 'printed':
            return builtin.text.call({
                column: table => table.print.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        default:
            return builtin.text.call({
                column: table => table.cardLocalization.typeline,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: false }, table },
            });
        }
    });

export const text = cs
    .commands.text
    .handler(({ modifier, value, operator, qualifier }, { table }) => {
        switch (modifier) {
        case 'unified':
            return builtin.text.call({
                column: table => table.cardLocalization.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        case 'printed':
            return builtin.text.call({
                column: table => table.print.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        default:
            return builtin.text.call({
                column: table => table.cardLocalization.text,
                args:   { value, operator, qualifier },
                ctx:    { meta: { multiline: true }, table },
            });
        }
    });

export const layout = cs.commands.layout.simple(table => table.print.layout);

export const rarity = cs
    .commands.rarity
    .handler(({ value, operator, qualifier }, { table }) => {
        const rarities = ({})[value] ?? value;

        return builtin.simple.call({
            column: table => table.print.rarity,
            args:   { value: rarities, operator, qualifier },
            ctx:    { table },
        });
    });
