import { ca } from '../adapter';

import { simpleSet as simpleSetSchema } from '@search/command/builtin/simple-set';

import { defaultTranslate } from 'src/search/translate';

const operatorMap: Record<string, string> = {
    '=':  'is',
    '!=': 'is-not',
    ':':  'include',
    '!:': 'not-include',
};

export const simpleSet = ca
    .adapt(simpleSetSchema)
    .$meta<{ id: string, map?: Record<string, string> | boolean | ((value: string) => string) }>()
    .explain((arg, { id, map }, i18n) => {
        const { value } = arg;

        const realParam = (() => {
            // NO changes
            if (map == null || map === false) {
                return value;
            }

            if (typeof value !== 'string') {
                return value;
            }

            // For arrays or comma-separated values
            const values = Array.isArray(value) ? value : value.split(',');

            const mapped = values.map(v => {
                const paramKey = map === true
                    ? v
                    : map instanceof Function
                        ? map(v)
                        : map[v] ?? v;

                return i18n(`$.parameter.${id}.${paramKey}`);
            });

            return mapped.join(', ');
        })();

        return defaultTranslate({ ...arg, value: realParam }, i18n, id, operatorMap);
    });
