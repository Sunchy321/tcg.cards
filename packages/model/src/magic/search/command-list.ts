import { colorWords } from './bitmap';

import { c as creator } from '#search/index';

import * as builtin from '#search/command/builtin';
import { cost } from './command/cost';
import { numeric } from './command/numeric';

const c = creator
  .use({ ...builtin, cost, numeric });

export const raw = c
  .none
  .regex(true)
  .logical({
    expansion: ['card-part.name', 'card-part-localization.name', 'card-part.text', 'card-part-localization.text', 'card-part.cost'],
  })
  .done();

export const stats = c
  .simple
  .pattern('{{power}}/{{toughness}}', true)
  .logical({
    valueClass: 'composite',
    expansion:  ['power', 'toughness'],
  })
  .done();

export const hash = c
  .simple
  .pattern('#{{tag}}')
  .logical({
    valueClass: 'composite',
    expansion:  ['card.tags', 'print.printTags'],
  })
  .done();

/** Print reference `set#number` or `set#number#lang`, matched on the whole raw text. */
export const print = c
  .simple
  .pattern('{{set}}#{{number}}', true)
  .id('print')
  .logical({
    valueClass: 'composite',
    expansion:  ['print.set', 'print.number', 'print.lang', 'raw'],
  })
  .done();

export const set = c
  .simple
  .alt(['expansion', 's', 'e'])
  .done();

export const number = c
  .string
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
  .mod({ oracle: 'on', localized: 'ln', printed: 'pn' })
  .logical({
    expansion: ['card-part.name', 'card-part-localization.name', 'print-part.name'],
  })
  .done();

export const type = c
  .text
  .alt('t')
  .mod({ oracle: 'ot', localized: 'lt', printed: 'pt' })
  .logical({
    expansion: ['card-part.typeline', 'card-part-localization.typeline', 'print-part.typeline'],
  })
  .done();

export const text = c
  .text
  .alt('x')
  .mod({ oracle: 'ox', localized: 'lx', printed: 'px' })
  .logical({
    expansion: ['card-part.text', 'card-part-localization.text', 'print-part.text'],
  })
  .done();

export const oracle = c
  .text
  .alt('o')
  .logical({
    expansion: ['card-part.text', 'card-part-localization.text'],
  })
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
  .numberSet
  .id('multiverse-id')
  .alt(['mid'])
  .done();

export const order = c
  .simple
  .logical({
    valueClass:          'sort',
    nullSemantics:       'not-applicable',
    textSemantics:       'not-applicable',
    collectionSemantics: 'not-applicable',
    witness:             [],
  })
  .done();

export { ambit } from '#search/index';
