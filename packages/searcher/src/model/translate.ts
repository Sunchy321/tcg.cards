import { Expression } from '../parser';
import { DBQuery } from '../command/backend';
import { AnyBackendCommand, PostAction } from './type';
import { QueryError } from '../command/error';

import { matchPattern } from '../command/match-pattern';

export type TranslatedQuery = {
    dbQuery: DBQuery;
    post: PostAction[];
};

export function translate(expr: Expression, commands: AnyBackendCommand[]): TranslatedQuery {
    if (expr.type === 'logic') {
        const value = expr.exprs.map(v => translate(v, commands));

        const dbQuery = [];
        const post = [];

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

    const cmd = expr.type === 'simple' ? expr.cmd : '';

    if (expr.type === 'simple' || expr.type === 'raw') {
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
                            if (cmd === `${c.id}.${lm}` || cmd === `${sm}${c.id}`) {
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

        const allowRegex: boolean = (command.allowRegex as boolean) ?? true;

        const parameter = (() => {
            if (expr.argType === 'string') {
                return expr.arg;
            } else {
                if (!allowRegex) {
                    throw new QueryError({ type: 'invalid-regex' });
                }

                try {
                    return new RegExp(expr.arg);
                } catch (e) {
                    throw new QueryError({
                        type:  'invalid-regex',
                        value: expr.arg,
                    });
                }
            }
        })();

        const operator = expr.type === 'simple' ? expr.op : '' as const;
        const qualifier = expr.type === 'simple' ? (expr.qual ?? []) : [];

        if (!command.operators.includes(operator)) {
            throw new QueryError({ type: 'invalid-operator' });
        }

        if (command.post == null) {
            try {
                return {
                    dbQuery: command.query({
                        modifier, parameter, operator, qualifier,
                    }),
                    post: [],
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
                    action: command.post!({
                        modifier, parameter, operator, qualifier,
                    }),
                }],
            };
        }
    } else {
        const command = commands.find(c => {
            if (c.pattern == null) {
                return false;
            }

            return matchPattern(c.pattern, expr.tokens.map(v => v.text).join(''));
        });

        if (command == null) {
            throw new QueryError({ type: 'unknown-command' });
        }

        const parameter = expr.tokens.map(v => v.text).join('');
        const pattern = matchPattern(command.pattern, parameter);

        const operator = '';
        const qualifier = expr.qual ?? [];

        if (command.post == null) {
            try {
                return {
                    dbQuery: command.query({
                        parameter, pattern, operator, qualifier,
                    }),
                    post: [],
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
                    action: command.post({
                        parameter, pattern, operator, qualifier,
                    }),
                }],
            };
        }
    }
}
