import { ca } from '../adapter';

import { bit as bitSchema } from '@search/command/builtin/bit';

import { defaultTranslate } from 'src/search/translate';

const operatorMap: Record<string, string> = {
    '=':  'is',
    '!=': 'is-not',
    ':':  'is',
    '!:': 'is-not',
    '>':  'greater-than',
    '>=': 'greater-or-equal',
    '<':  'less-than',
    '<=': 'less-or-equal',
};

export const bit = ca
    .adapt(bitSchema)
    .$meta<{ id: string, map?: Record<string, string> | boolean | ((value: string) => string) }>()
    .explain((args, { id, map }, i18n) => {
        const { value } = args;

        const realParam = (() => {
            // NO changes
            if (map == null || map === false) {
                return value;
            }

            if (typeof value !== 'string') {
                return value;
            }

            const paramKey = map === true
                ? value
                : map instanceof Function
                    ? map(value)
                    : map[value] ?? value;

            return i18n(`$.parameter.${id}.${paramKey}`);
        })();

        return defaultTranslate({ ...args, value: realParam }, i18n, id, operatorMap);
    });
