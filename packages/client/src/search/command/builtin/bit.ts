import { ca } from '../adapter';

import { bit as bitSchema, Word } from '@search/command/builtin/bit';

import { defaultTranslate } from 'src/search/translate';

const operatorMap: Record<string, string> = {
    '=':  'is',
    '!=': 'is-not',
    ':':  'includes',
    '!:': 'not-includes',
    '>':  'greater-than',
    '>=': 'greater-or-equal',
    '<':  'less-than',
    '<=': 'less-or-equal',
};

const countOperatorMap: Record<string, string> = {
    '=':  'count-is',
    '!=': 'count-is-not',
    ':':  'count-is',
    '!:': 'count-is-not',
    '>':  'count-greater-than',
    '>=': 'count-greater-or-equal',
    '<':  'count-less-than',
    '<=': 'count-less-or-equal',
};

export const bit = ca
    .adapt(bitSchema)
    .$meta<{ id: string, values: string, words?: Record<string, Word>, map?: Record<string, string> | boolean | ((value: string) => string) }>()
    .explain((args, { id, values, words = {}, map }, i18n) => {
        const { value } = args;

        if (typeof value !== 'string') {
            return defaultTranslate(args, i18n, id, operatorMap);
        }

        // Check if it's a predefined word
        const word = words[value];

        const match: Word = (() => {
            if (word != null) {
                return word;
            }

            // Check if it's a count expression (e.g., "=2", ">=3", or just "2")
            if (/^\d+/.test(value) && !/\d/.test(values)) {
                return {
                    type:  'count',
                    value: '?' + value,
                };
            }

            // Otherwise it's exact match
            return {
                type:  'exact',
                value: value.toUpperCase().split('').filter(c => values.includes(c)).join(''),
            };
        })();

        const realValue = (() => {
            switch (match.type) {
            case 'exact': {
                // Translate each character if map is provided
                if (map == null || map === false) {
                    return match.value;
                }

                const chars = match.value.split('').map(c => {
                    const paramKey = map === true
                        ? c
                        : map instanceof Function
                            ? map(c)
                            : map[c] ?? c;

                    return i18n(`$.parameter.${id}.${paramKey}`);
                });

                return chars.join('');
            }
            case 'enum': {
                // For enum type, translate the original value
                if (map == null || map === false) {
                    return value;
                }

                const paramKey = map === true
                    ? value
                    : map instanceof Function
                        ? map(value)
                        : map[value] ?? value;

                return i18n(`$.parameter.${id}.${paramKey}`);
            }
            case 'count': {
                // For count type, extract the number
                const m = /^([<>=?]|>=|<=)?(\d+)$/.exec(match.value);
                if (!m) {
                    return value;
                }

                const [, op, num] = m;

                // If operator is embedded in value (e.g., ">=3"), use it
                if (op && op !== '?') {
                    return num;
                }

                // Otherwise just return the number
                return num;
            }
            default:
                return value;
            }
        })();

        // For count type with embedded operator, adjust the operator map
        if (match.type === 'count') {
            // Embedded operator takes precedence
            return defaultTranslate({ ...args, value: realValue }, i18n, id, countOperatorMap);
        }

        return defaultTranslate({ ...args, value: realValue }, i18n, id, operatorMap);
    });
