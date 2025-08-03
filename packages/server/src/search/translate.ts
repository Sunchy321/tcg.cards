import { SQL, and, or, not } from 'drizzle-orm';

import { Expression } from '@search/parser';
import { CommonServerCommand, PostAction } from './command';
import { CommonArgument } from '@search/command';
import { QueryError } from '@search/command/error';

import { matchPattern } from '@search/command/match-pattern';

export type TranslatedQuery = {
    query: SQL | undefined;
    post:  PostAction[];
};

function simpleTranslate(
    command: CommonServerCommand,
    expr: Expression,
    arg: CommonArgument,
): TranslatedQuery {
    const { parameter, operator } = arg;

    if (parameter instanceof RegExp && !command.allowRegex) {
        throw new QueryError({ type: 'invalid-regex' });
    }

    if (!command.operators.includes(operator)) {
        throw new QueryError({ type: 'invalid-operator', payload: { operator } });
    }

    if (command.post == null) {
        try {
            return {
                query: command.query(arg),
                post:  [],
            };
        } catch (e) {
            throw new QueryError({ type: e.type });
        }
    } else {
        if (!expr.topLevel) {
            throw new QueryError({ type: 'not-toplevel-command' });
        }

        return {
            query: undefined,
            post:  [command.post!(arg)],
        };
    }
}

export function translate(expr: Expression, commands: CommonServerCommand[]): TranslatedQuery {
    // computed expression
    if (expr.type === 'logic') {
        const value = expr.exprs.map(v => translate(v, commands));

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
        const result = translate(expr.expr, commands);

        return {
            query: result.query != undefined ? not(result.query) : undefined,
            post:  result.post,
        };
    } else if (expr.type === 'paren') {
        return translate(expr.expr, commands);
    }

    // parameter
    const parameter = (() => {
        if (expr.type === 'simple' || expr.type === 'raw') {
            if (expr.argType === 'regex') {
                try {
                    return new RegExp(expr.arg.slice(1, -1));
                } catch (_e) {
                    throw new QueryError({
                        type:    'invalid-regex',
                        payload: expr.arg.slice(1, -1),
                    });
                }
            } else if (expr.argType === 'string') {
                return expr.arg.slice(1, -1).replace(/\\\\./g, v => v.slice(1));
            } else {
                return expr.arg;
            }
        } else {
            return expr.tokens.map(t => t.text).join('');
        }
    })();

    // simple expr, such as cmd:arg or cmd=arg
    if (expr.type === 'simple') {
        const { cmd } = expr;

        const { command, modifier = undefined } = (() => {
            const nameMatched = commands.find(c => c.id === cmd || c.alt?.includes(cmd));

            if (nameMatched != null) {
                return { command: nameMatched };
            }

            for (const c of commands) {
                if (c.id === cmd || c.alt?.includes(cmd)) {
                    return { command: c };
                }

                if (c.modifiers != null) {
                    if (Array.isArray(c.modifiers)) {
                        for (const m of c.modifiers) {
                            if (cmd === `${c.id}.${m}`) {
                                return { command: c, modifier: m };
                            }
                        }
                    } else {
                        for (const [lm, sm] of Object.entries(c.modifiers)) {
                            if (cmd === `${c.id}.${lm}` || cmd === sm) {
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
            modifier, parameter, operator, qualifier, meta: command.meta,
        });
    }

    // find patterns
    if (!(parameter instanceof RegExp)) {
        const command = commands.find(c => {
            if (c.pattern == null) {
                return false;
            }

            for (const p of c.pattern) {
                if (matchPattern(p, parameter)) {
                    return true;
                }
            }

            return false;
        });

        if (command != null) {
            const pattern = command.pattern!
                .map(p => matchPattern(p, parameter))
                .find(p => p != null)!;

            return simpleTranslate(command, expr, {
                parameter,
                pattern,
                operator:  '',
                qualifier: expr.qual ?? [],
                meta:      command.meta,
            });
        }
    }

    const raw = commands.find(c => c.id === '');

    if (raw == null) {
        throw new QueryError({ type: 'unknown-command', payload: { name: '<raw>' } });
    }

    return simpleTranslate(raw, expr, {
        parameter,
        operator:  '',
        qualifier: expr.qual ?? [],
        meta:      raw.meta,
    });
}
