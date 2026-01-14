import { SQL, and, or, not } from 'drizzle-orm';

import { Expression } from '@search/parser';
import { CasingCache } from 'drizzle-orm/casing';

import { CommonCommandInput } from '@search/command/types';
import { QueryError } from '@search/command/error';

import { matchPattern } from '@search/command/match-pattern';
import { CommonServerCommand, PostAction } from '@/search/command';

export type TranslatedQuery = {
    query: SQL | undefined;
    post:  PostAction[];
};

function simpleTranslate<Table>(
    command: CommonServerCommand,
    expr: Expression,
    args: CommonCommandInput,
    table: Table,
): TranslatedQuery {
    const { input } = command.options;

    const { value, operator } = args;

    if (value instanceof RegExp && !input.regex) {
        throw new QueryError({ type: 'invalid-regex' });
    }

    if (!input.operators.includes(operator)) {
        throw new QueryError({ type: 'invalid-operator', payload: { operator } });
    }

    try {
        const ctx = {
            meta:  command.options.meta,
            table: table,
        };

        if (command.is('query')) {
            const ctx = {
                meta:  command.options.meta,
                table: table,
            };

            const query = command.handler(args as any, ctx) as SQL;

            console.log('Generated SQL: ', command.options.id);
            console.log('query:', query.toQuery({
                casing:       new CasingCache(),
                escapeName:   (name: string) => `"${name}"`,
                escapeParam:  (num: number) => `$${num}`,
                escapeString: (str: string) => `'${str.replace(/'/g, '\'\'')}'`,
            }));

            return { query, post: [] };
        } else if (command.is('order-by')) {
            if (!expr.topLevel) {
                throw new QueryError({ type: 'not-toplevel-command' });
            }

            const action = command.call(args as any, ctx);

            console.log('Generated Post Action: ', command.options.id);
            console.log('action:', action.map(a => {
                const sql = a.getSQL();

                return sql.toQuery({
                    casing:       new CasingCache(),
                    escapeName:   (name: string) => `"${name}"`,
                    escapeParam:  (num: number) => `$${num}`,
                    escapeString: (str: string) => `'${str.replace(/'/g, '\'\'')}'`,
                });
            }));

            return {
                query: undefined,
                post:  [{ phase: 'order-by', action }],
            };
        } else {
            throw new QueryError({ type: 'invalid-command-kind' });
        }
    } catch (e) {
        console.log(e);
        throw new QueryError({ type: e.type });
    }
}

export function translate<Table>(expr: Expression, commands: CommonServerCommand[], table: Table): TranslatedQuery {
    // computed expression
    if (expr.type === 'logic') {
        const value = expr.exprs.map(v => translate(v, commands, table));

        const sql: SQL[] = [];
        const post: PostAction[] = [];

        for (const v of value) {
            if (v.query == null) {
                post.push(...v.post);
            } else {
                sql.push(v.query);
            }
        }

        if (sql.length > 0) {
            return {
                query: expr.sep === '|' ? or(...sql) : and(...sql),
                post,
            };
        } else {
            return {
                query: undefined,
                post,
            };
        }
    } else if (expr.type === 'not') {
        const result = translate(expr.expr, commands, table);

        return {
            query: result.query != undefined ? not(result.query) : undefined,
            post:  result.post,
        };
    } else if (expr.type === 'paren') {
        return translate(expr.expr, commands, table);
    }

    // value
    const value = (() => {
        if (expr.type === 'simple' || expr.type === 'raw') {
            if (expr.argType === 'regex') {
                try {
                    return new RegExp(expr.args.slice(1, -1));
                } catch (_e) {
                    throw new QueryError({
                        type:    'invalid-regex',
                        payload: expr.args.slice(1, -1),
                    });
                }
            } else if (expr.argType === 'string') {
                return expr.args.slice(1, -1).replace(/\\\\./g, v => v.slice(1));
            } else {
                return expr.args;
            }
        } else {
            return expr.tokens.map(t => t.text).join('');
        }
    })();

    // simple expr, such as cmd:arg or cmd=arg
    if (expr.type === 'simple') {
        const { cmd } = expr;

        const { command, modifier = undefined } = (() => {
            const nameMatched = commands.find(c => c.options.id === cmd || c.options.alternatives?.includes(cmd));

            if (nameMatched != null) {
                return { command: nameMatched };
            }

            for (const c of commands) {
                const id = c.options.id;

                if (id === cmd || c.options.alternatives?.includes(cmd)) {
                    return { command: c };
                }

                if (c.options.input.modifiers != null) {
                    const modifiers = c.options.input.modifiers;

                    if (Array.isArray(modifiers)) {
                        for (const m of modifiers) {
                            if (cmd === `${id}.${m}`) {
                                return { command: c, modifier: m };
                            }
                        }
                    } else {
                        for (const [lm, sm] of Object.entries(modifiers)) {
                            if (cmd === `${id}.${lm}` || cmd === sm) {
                                return { command: c, modifier: lm };
                            }
                        }
                    }
                }
            }

            return { command: undefined };
        })();

        if (command == null) {
            throw new QueryError({ type: 'unknown-command', payload: { name: cmd } });
        }

        const operator = expr.type === 'simple' ? expr.op : '' as const;
        const qualifier = expr.type === 'simple' ? (expr.qual ?? []) : [];

        return simpleTranslate(command, expr, {
            modifier, value, operator, qualifier,
        }, table);
    }

    // find patterns
    if (!(value instanceof RegExp)) {
        const command = commands.find(c => {
            if (c.options.input.pattern == null) {
                return false;
            }

            for (const p of [c.options.input.pattern]) {
                if (matchPattern(p, value)) {
                    return true;
                }
            }

            return false;
        });

        if (command != null) {
            // TODO: multiple patterns
            const pattern = [command.options.input.pattern!]
                .map(p => matchPattern(p, value))
                .find(p => p != null)! as any;

            return simpleTranslate(command, expr, {
                value,
                pattern,
                operator:  '',
                qualifier: expr.qual ?? [],
            }, table);
        }
    }

    const raw = commands.find(c => c.options.id === '');

    if (raw == null) {
        throw new QueryError({ type: 'unknown-command', payload: { name: '<raw>' } });
    }

    return simpleTranslate(raw, expr, {
        value,
        operator:  '',
        qualifier: expr.qual ?? [],
    }, table);
}
