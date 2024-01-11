import { FrontendModel } from './index';

import { Expression } from '../../parser';
import { CommonFrontendCommand, I18N } from '../../command/frontend';
import { CommonArgument } from '../../command';
import { QueryError } from '../../command/error';

import { matchPattern } from '../../command/match-pattern';

function simpleTranslate(
    command: CommonFrontendCommand,
    expr: Expression,
    arg: CommonArgument,
    model: FrontendModel,
    i18n: I18N,
): string {
    const {
        modifier, parameter, operator, qualifier,
    } = arg;

    if (parameter instanceof RegExp && !command.allowRegex) {
        throw new QueryError({ type: 'invalid-regex' });
    }

    if (!command.operators.includes(operator)) {
        throw new QueryError({ type: 'invalid-operator' });
    }

    const specialized = command.explain(arg, i18n);

    if (specialized != null) {
        return specialized;
    }

    const id = modifier != null ? `${command.id}:${modifier}` : command.id;

    const commandText = i18n(`${model.id}.command.${id}`);

    const realOperator = (() => {
        if (qualifier.includes('!')) {
            return `!${operator}`;
        }

        return operator;
    })();

    const operatorText = i18n(`operator.${realOperator}`);

    return `${commandText}${operatorText}${parameter}`;
}

export function translate(expr: Expression, model: FrontendModel, i18n: (key: string) => string): string {
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
        }, model, i18n);
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
            }, model, i18n);
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
    }, model, i18n);
}
