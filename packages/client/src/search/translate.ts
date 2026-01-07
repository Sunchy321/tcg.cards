import { Expression } from '@search/parser';
import { I18N, CommonClientCommandOption } from './command';
import { CommonCommandInput, Operator, Qualifier } from '@search/command';
import { QueryError } from '@search/command/error';

import { matchPattern } from '@search/command/match-pattern';

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

type OperatorMap = Record<string, string> | ((operator: string, args: CommonCommandInput) => string);

export function defaultTranslate(
    args: CommonCommandInput,
    i18n: I18N,
    id: string,
    map: OperatorMap,
): string {
    const {
        modifier, value, operator, qualifier,
    } = args;

    const realId = modifier != null ? `${id}:${modifier}` : id;

    const commandText = i18n(`$.command.${realId}`);

    const realOperator = (() => {
        if (qualifier.includes('!')) {
            return `!${operator}`;
        }

        return operator;
    })();

    const operatorId = typeof map === 'function' ? map(realOperator, args) : map[realOperator] ?? realOperator;

    const operatorText = i18n(`operator.${operatorId}`);

    return `${commandText}${operatorText}${value}`;
}

function simpleTranslate(
    command: CommonClientCommandOption,
    args: CommonCommandInput,
    i18n: I18N,
): string {
    const { value, operator } = args;

    if (value instanceof RegExp && !command.options.input.regex) {
        throw new QueryError({ type: 'invalid-regex' });
    }

    if (!command.options.input.operators.includes(operator)) {
        console.log(command.options, operator, command.options.input.operators.includes(operator));

        throw new QueryError({ type: 'invalid-operator' });
    }

    return command.explain?.(args as any, i18n) ?? defaultTranslate(args, i18n, command.options.id ?? 'unknown', realOperatorMap);
}

export function translate(
    expr: Expression,
    commands: CommonClientCommandOption[],
    i18n: I18N,
): string {
    // computed expression
    if (expr.type === 'logic') {
        const value = expr.exprs.map(v => translate(v, commands, i18n));

        const sep = expr.sep === '|' ? i18n('separator.|') : i18n('separator.&');

        return value.join(` ${sep} `);
    } else if (expr.type === 'not') {
        const result = translate(expr.expr, commands, i18n);

        const qual = i18n('qualifier.!');

        return qual + result;
    } else if (expr.type === 'paren') {
        return `(${translate(expr.expr, commands, i18n)})`;
    }

    // parameter
    const value = (() => {
        if (expr.type === 'simple' || expr.type === 'raw') {
            if (expr.argType === 'regex') {
                try {
                    return new RegExp(expr.args.slice(1, -1));
                } catch (_e) {
                    throw new QueryError({
                        type:    'invalid-regex',
                        payload: { pattern: expr.args.slice(1, -1) },
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

    // simple expr, such as cmd:args or cmd=args
    if (expr.type === 'simple') {
        const { cmd } = expr;

        const { command, modifier = undefined } = (() => {
            const nameMatched = commands.find(c => c.options.id === cmd || c.options.alternatives?.includes(cmd));

            if (nameMatched != null) {
                return { command: nameMatched };
            }

            for (const c of commands) {
                if (c.options.input.modifiers != null) {
                    if (Array.isArray(c.options.input.modifiers)) {
                        for (const m of c.options.input.modifiers) {
                            if (cmd === `${c.options.id}.${m}`) {
                                return { command: c, modifier: m };
                            }
                        }
                    } else {
                        for (const [lm, sm] of Object.entries(c.options.input.modifiers)) {
                            if (cmd === `${c.options.id}.${lm}` || (typeof sm === 'string' && cmd === sm)) {
                                return { command: c, modifier: lm };
                            } else if (Array.isArray(sm) && sm.includes(cmd)) {
                                return { command: c, modifier: lm };
                            }
                        }
                    }
                }
            }

            throw new QueryError({
                type:    'unknown-command',
                payload: { command: cmd },
            });
        })();

        const pattern = command.options.input.pattern != null && typeof value === 'string'
            ? matchPattern(command.options.input.pattern, value)
            : undefined;

        const qualifier: Qualifier[] = expr.qual ?? [];

        const args = {
            modifier,
            pattern,
            value,
            operator: expr.op,
            qualifier,
        } satisfies CommonCommandInput;

        return simpleTranslate(command, args, i18n);
    }

    // raw expr
    if (expr.type === 'raw') {
        const command = commands.find(c => c.options.type === 'none');

        if (command == null) {
            throw new QueryError({ type: 'no-raw-command' });
        }

        const args = {
            modifier:  undefined,
            pattern:   undefined,
            value,
            operator:  '',
            qualifier: [],
        } satisfies CommonCommandInput;

        return simpleTranslate(command, args, i18n);
    }

    // pattern expr
    const command = (() => {
        for (const c of commands) {
            if (c.options.type === 'pattern' && typeof value === 'string') {
                const pattern = c.options.input.pattern != null ? matchPattern(c.options.input.pattern, value) : undefined;

                if (pattern != null) {
                    return c;
                }
            }
        }

        return undefined;
    })();

    if (command == null) {
        throw new QueryError({ type: 'no-pattern-match' });
    }

    const pattern = command.options.input.pattern != null && typeof value === 'string'
        ? matchPattern(command.options.input.pattern, value)
        : undefined;

    const args = {
        modifier:  undefined,
        pattern,
        value,
        operator:  ':',
        qualifier: [],
    } satisfies CommonCommandInput;

    return simpleTranslate(command, args, i18n);
}
