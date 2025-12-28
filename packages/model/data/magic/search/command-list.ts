import { colorWords } from './bitmap';

import { c as creator } from '@search/common';

import * as builtin from '@search/common/command/builtin';
import { cost } from './command/cost';
import { numeric } from './command/numeric';

const c = creator
    .use({ ...builtin, cost, numeric });

export const raw = c
    .none
    .regex(true)
    .done();

export const stats = c
    .simple
    .pattern('{{power}}/{{toughness}}', true)
    .done();

export const hash = c
    .simple
    .pattern('#{{tag}}')
    .done();

export const set = c
    .simple
    .alt(['expansion', 's', 'e'])
    .done();

export const number = c
    .simple
    .id('number')
    .alt('num')
    .done();

export const lang = c
    .simple
    .alt('l')
    .done();

export const manaCost = c
    .cost
    .id('cost')
    .alt(['mana', 'mana-cost', 'm'])
    .done();

export const manaValue = c
    .number
    .id('mana-value')
    .alt(['mv', 'cmc'])
    .done();

export const color = c
    .bit
    .alt('c')
    .meta({ values: 'WUBRGOP', words: colorWords })
    .done();

export const colorIdentity = c
    .bit
    .id('color-identity')
    .alt(['identity', 'cd'])
    .meta({ values: 'WUBRGOP', words: colorWords })
    .done();

export const colorIndicator = c
    .bit
    .id('color-indicator')
    .alt(['ci'])
    .meta({ values: 'WUBRG', words: colorWords })
    .done();

export const power = c
    .numeric
    .alt('pow')
    .done();

export const toughness = c
    .numeric
    .alt('tou')
    .done();

export const loyalty = c
    .numeric
    .alt('loy')
    .pattern('[{{loyalty}}]')
    .done();

export const defense = c
    .numeric
    .alt('def')
    .pattern('<{{defense}}>')
    .done();

export const name = c
    .text
    .alt('n')
    .mod({ oracle: 'on', unified: 'un', printed: 'pn' })
    .done();

export const type = c
    .text
    .alt('t')
    .mod({ oracle: 'ot', unified: 'ut', printed: 'pt' })
    .done();

export const text = c
    .text
    .alt('x')
    .mod({ oracle: 'ox', unified: 'ux', printed: 'px' })
    .done();

export const oracle = c
    .text
    .alt('o')
    .done();

export const flavorText = c
    .text
    .id('flavor-text')
    .alt(['flavor', 'ft'])
    .done();

export const flavorName = c
    .text
    .id('flavor-name')
    .alt('fn')
    .done();

export const layout = c
    .simple
    .done();

export const imageStatus = c
    .simple
    .id('image-status')
    .done();

export const rarity = c
    .simple
    .alt('r')
    .done();

export const date = c
    .all
    .id('release-date')
    .alt('date')
    .done();

export const format = c
    .simple
    .alt('f')
    .done();

export const counter = c
    .simpleSet
    .done();

export const keyword = c
    .simpleSet
    .done();

export const multiverseId = c
    .simpleSet
    .id('multiverse-id')
    .alt(['mid'])
    .done();

export const order = c
    .simple
    .done();
