import { Expression } from '../parser';
import { CommonBackendCommand, DBQuery } from '../command/backend';
import { PostAction } from './type';
import { QueryError } from '../command/error';

import { matchPattern } from '../command/match-pattern';

export type TranslatedQuery = {
    dbQuery: DBQuery;
    post: PostAction[];
};

type CommonBackendCommandArgs = Parameters<CommonBackendCommand['query']>[0];

function simpleTranslate(
    command: CommonBackendCommand,
    expr: Expression,
    args: CommonBackendCommandArgs,
): TranslatedQuery {
    const { parameter, operator } = args;

    if (parameter instanceof RegExp && !command.allowRegex) {
        throw new QueryError({ type: 'invalid-regex' });
    }

    if (!command.operators.includes(operator)) {
        throw new QueryError({ type: 'invalid-operator' });
    }

    if (command.post == null) {
        try {
            return {
                dbQuery: command.query(args),
                post:    [],
            };
        } catch (e) {
            throw new QueryError({ type: e.type });
        }
    } else {
        if (!expr.topLevel) {
            throw new QueryError({ type: 'not-toplevel-command' });
        }

        return {
            dbQuery: undefined,
            post:    [{
                phase:  command.phase as string,
                action: command.post!(args),
            }],
        };
    }
}

export function translate(expr: Expression, commands: CommonBackendCommand[]): TranslatedQuery {
    // computed expression
    if (expr.type === 'logic') {
        const value = expr.exprs.map(v => translate(v, commands));

        const dbQuery: DBQuery = [];
        const post: PostAction[] = [];

        const sep = expr.sep === '|' ? '$or' : '$and';

        for (const v of value) {
            if (v.dbQuery == null) {
                post.push(...v.post);
            } else if (v.dbQuery[sep] != null) {
                dbQuery.push(...v.dbQuery[sep]);
            } else {
                dbQuery.push(v.dbQuery);
            }
        }

        if (dbQuery.length > 0) {
            return {
                dbQuery: { [sep]: dbQuery },
                post,
            };
        } else {
            return {
                dbQuery: undefined,
                post,
            };
        }
    } else if (expr.type === 'not') {
        const result = translate(expr.expr, commands);

        return { dbQuery: { $not: result.dbQuery }, post: result.post };
    } else if (expr.type === 'paren') {
        return translate(expr.expr, commands);
    }

    // parameter
    const parameter = (() => {
        if (expr.type === 'simple' || expr.type === 'raw') {
            if (expr.argType === 'regex') {
                try {
                    return new RegExp(expr.arg.slice(1, -1));
                } catch (e) {
                    throw new QueryError({
                        type:  'invalid-regex',
                        value: expr.arg.slice(1, -1),
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
            throw new QueryError({ type: 'unknown-command' });
        }

        const operator = expr.type === 'simple' ? expr.op : '' as const;
        const qualifier = expr.type === 'simple' ? (expr.qual ?? []) : [];

        return simpleTranslate(command, expr, {
            modifier, parameter, operator, qualifier,
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
            });
        }
    }

    const raw = commands.find(c => c.id === '');

    if (raw == null) {
        throw new QueryError({ type: 'unknown-command' });
    }

    return simpleTranslate(raw, expr, {
        parameter,
        operator:  '',
        qualifier: expr.qual ?? [],
    });
}
