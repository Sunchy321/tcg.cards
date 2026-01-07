import { ca } from '../adapter';

import { number as numberSchema } from '@search/command/builtin/number';

import { defaultTranslate } from 'src/search/translate';

const operatorMap: Record<string, string> = {
    '=':  'is',
    '!=': 'is-not',
    '>':  'greater-than',
    '>=': 'greater-or-equal',
    '<':  'less-than',
    '<=': 'less-or-equal',
};

export const number = ca
    .adapt(numberSchema)
    .$meta<{ id: string }>()
    .explain((args, { id }, i18n) => {
        return defaultTranslate(args, i18n, id, operatorMap);
    });
