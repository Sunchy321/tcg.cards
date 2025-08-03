import { Expression } from './index';

export function simplify(expr: Expression): Expression {
    if (expr.type === 'not') {
        if (expr.expr.type === 'not') {
            return {
                ...simplify(expr.expr.expr),

                topLevel: false,
            };
        }

        const nested = simplify(expr.expr);

        if (nested.type === 'logic') {
            return simplify({
                type:  'logic',
                sep:   nested.sep === '&' ? '|' : '&',
                exprs: nested.exprs.map(v => ({
                    type:     'not',
                    expr:     v,
                    tokens:   v.tokens,
                    location: v.location,
                    topLevel: v.topLevel,
                })),
                tokens:   nested.tokens,
                location: nested.location,
                topLevel: expr.topLevel,
            });
        } else if (nested.type === 'simple') {
            return {
                type: 'simple',
                cmd:  nested.cmd,
                op:   nested.op,
                qual: nested.qual?.includes('!')
                    ? nested.qual.filter(v => v !== '!')
                    : ['!', ...nested.qual ?? []],
                argType: nested.argType,
                arg:     nested.arg,

                tokens:   nested.tokens,
                location: nested.location,
                topLevel: expr.topLevel,
            };
        } else {
            return {
                ...expr,
                qual: expr.qual?.includes('!')
                    ? expr.qual.filter(v => v !== '!')
                    : ['!', ...expr.qual ?? []],
            };
        }
    } else if (expr.type === 'logic') {
        const simplifiedValue: Expression[] = [];

        for (const v of expr.exprs) {
            const value = simplify(v);

            if (value.type === 'logic' && value.sep === expr.sep) {
                simplifiedValue.push(...value.exprs);
            } else {
                simplifiedValue.push(value);
            }
        }

        return {
            type:  expr.type,
            sep:   expr.sep,
            exprs: simplifiedValue,

            tokens:   expr.tokens,
            location: expr.location,
            topLevel: expr.topLevel,
        };
    } else {
        return expr;
    }
}
