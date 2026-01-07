import { ca } from '../../../command/adapter';

import { numeric as numericSchema } from '@model/magic/search/command/numeric';

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

export const numeric = ca
    .adapt(numericSchema)
    .$meta<{ id: string }>()
    .explain((arg, { id }, i18n) => {
        return defaultTranslate(arg, i18n, id, operatorMap);
    });
