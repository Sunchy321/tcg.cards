import { ClientModel } from './index';

import { Expression } from '../../parser';
import { CommonClientCommand, I18N } from '../../command/client';
import {
    Command, CommonArgument, Operator, Qualifier,
} from '../../command';
import { QueryError } from '../../command/error';

import { matchPattern } from '../../command/match-pattern';

export type OperatorMapOf<C> = C extends Command<any, infer O, infer Q, any, any, any>
    ? Record<`${Q | ''}${O}`, string>
    : never;

const realOperatorMap: Record<`${Qualifier | ''}${Exclude<Operator, ''>}`, string> = {
    ':':  'match',
    '!:': 'not-match',
    '=':  'equal',
    '!=': 'not-equal',
    '<':  'less-than',
    '<=': 'less-equal',
    '>':  'greater-than',
    '>=': 'greater-equal',

    // aliases
    '!>':  'less-equal',
    '!<':  'greater-equal',
    '!>=': 'less-than',
    '!<=': 'greater-than',
};

type OperatorMap = Record<string, string> | ((operator: string, arg: CommonArgument) => string);

export function defaultTranslate(
    arg: CommonArgument,
    i18n: I18N,
    id: string,
    map: OperatorMap,
): string {
    const {
        modifier, parameter, operator, qualifier,
    } = arg;

    const realId = modifier != null ? `${id}:${modifier}` : id;

    const commandText = i18n(`$.command.${realId}`);

    const realOperator = (() => {
        if (qualifier.includes('!')) {
            return `!${operator}`;
        }

        return operator;
    })();

    const operatorId = typeof map === 'function' ? map(realOperator, arg) : map[realOperator] ?? realOperator;

    const operatorText = i18n(`operator.${operatorId}`);

    return `${commandText}${operatorText}${parameter}`;
}

function simpleTranslate(
    command: CommonClientCommand,
    expr: Expression,
    arg: CommonArgument,
    i18n: I18N,
): string {
    const { parameter, operator } = arg;

    if (parameter instanceof RegExp && !command.allowRegex) {
        throw new QueryError({ type: 'invalid-regex' });
    }

    if (!command.operators.includes(operator)) {
        throw new QueryError({ type: 'invalid-operator' });
    }

    return command.explain(arg, i18n) ?? defaultTranslate(arg, i18n, command.id, realOperatorMap);
}

export function translate(expr: Expression, model: ClientModel, i18n: (key: string) => string): string {
    const { commands } = model;

    // computed expression
    if (expr.type === 'logic') {
        const value = expr.exprs.map(v => translate(v, model, i18n));

        const sep = expr.sep === '|' ? i18n('separator.|') : i18n('separator.&');

        return value.join(` ${sep} `);
    } else if (expr.type === 'not') {
        const result = translate(expr.expr, model, i18n);

        const qual = i18n('qualifier.!');

        return qual + result;
    } else if (expr.type === 'paren') {
        return `(${translate(expr.expr, model, i18n)})`;
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
            modifier, parameter, operator, qualifier, meta: command.meta,
        }, i18n);
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
            }, i18n);
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
        meta:      raw.meta,
    }, i18n);
}
