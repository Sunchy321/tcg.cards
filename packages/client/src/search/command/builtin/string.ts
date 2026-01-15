import { ca } from '../adapter';

import { string as stringSchema } from '@search/command/builtin/string';

import { defaultTranslate } from 'src/search/translate';

const operatorMap: Record<string, string> = {
    ':':  'is',
    '=':  'is',
    '!=': 'is-not',
    '>':  'greater-than',
    '>=': 'greater-or-equal',
    '<':  'less-than',
    '<=': 'less-or-equal',
};

export const string = ca
    .adapt(stringSchema)
    .$meta<{ id: string }>()
    .explain((args, { id }, i18n) => {
        return defaultTranslate(args, i18n, id, operatorMap);
    });
