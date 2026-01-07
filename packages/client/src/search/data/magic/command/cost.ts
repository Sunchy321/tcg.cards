import { ca } from 'src/search/command/adapter';

import { cost as costSchema } from '@model/magic/search/command/cost';

import { defaultTranslate } from 'src/search/translate';

const operatorMap: Record<string, string> = {
    '=':  'is',
    '!=': 'is-not',
    ':':  'includes',
    '!:': 'not-includes',
};

export const cost = ca
    .adapt(costSchema)
    .$meta<{ id: string }>()
    .explain((arg, { id }, i18n) => {
        return defaultTranslate(arg, i18n, id, operatorMap);
    });
