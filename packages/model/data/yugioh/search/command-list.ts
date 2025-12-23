import { c } from './command';

export const raw = c
    .none
    .regex(true)
    .done();

export const stats = c
    .simple
    .pattern('{{attack}}/{{defense}}')
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

export const cost = c
    .number
    .alt('c')
    .done();

export const color = c
    .simpleSet
    .done();

export const lore = c
    .number
    .done();

export const strength = c
    .number
    .alt('st')
    .done();

export const willPower = c
    .number
    .id('will-power')
    .alt('w')
    .done();

export const moveCost = c
    .number
    .id('move-cost')
    .alt('mc')
    .done();

export const name = c
    .text
    .alt('n')
    .mod({ unified: 'un', printed: 'pn' })
    .done();

export const type = c
    .text
    .alt('t')
    .mod({ unified: 'ut', printed: 'pt' })
    .done();

export const text = c
    .text
    .alt('x')
    .mod({ unified: 'ux', printed: 'px' })
    .done();

export const flavorText = c
    .text
    .id('flavor-text')
    .alt(['flavor', 'ft'])
    .done();

export const layout = c
    .simple
    .done();

export const rarity = c
    .simple
    .alt('r')
    .done();

export const order = c
    .simple
    .done();
