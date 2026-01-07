import { ca } from '../adapter';

import { text as textSchema } from '@search/command/builtin/text';

import { defaultTranslate } from 'src/search/translate';

const textMap: Record<string, string> = {
    '=':  'equal',
    '!=': 'not-equal',
    ':':  'include',
    '!:': 'not-include',
};

const regexMap: Record<string, string> = {
    '=':  'fully-match',
    '!=': 'not-full-match',
    ':':  'match',
    '!:': 'not-match',
};

export const text = ca
    .adapt(textSchema)
    .$meta<{ id: string }>()
    .explain((arg, { id }, i18n) => {
        return defaultTranslate(arg, i18n, id, (op, { value }) => {
            if (value instanceof RegExp) {
                return regexMap[op] ?? op;
            } else {
                return textMap[op] ?? op;
            }
        });
    });
