import { c } from './command';

export const raw = c
    .none
    .regex(true)
    .done();

export const fullStats = c
    .simple
    .id('full-stats')
    .pattern('{{cost}}/{{attack}}/{{health}}', true)
    .done();

export const stats = c
    .simple
    .pattern('{{attack}}/{{health}}', true)
    .done();

export const hash = c
    .simple
    .pattern('#{{tag}}')
    .done();

export const lang = c
    .simple
    .alt('l')
    .done();

export const name = c
    .text
    .alt('n')
    .done();

export const text = c
    .text
    .alt('x')
    .done();

export const flavorText = c
    .text
    .id ('flavor-text')
    .alt(['flavor', 'ft'])
    .done();

export const set = c
    .simple
    .alt('s')
    .done();

export const classes = c
    .simpleSet
    .id('class')
    .alt('cl')
    .done();

export const type = c
    .simple
    .alt('t')
    .done();

export const cost = c
    .number
    .alt('c')
    .done();

export const attack = c
    .number
    .alt('a')
    .done();

export const health = c
    .number
    .alt('h')
    .done();

export const durability = c
    .number
    .alt('d')
    .done();

export const armor = c
    .number
    .alt('m')
    .done();

export const rune = c
    .simpleSet
    .meta({ valueMap: { blood: ['b'], frost: ['f'], undead: ['u'] }, countDuplicates: false })
    .done();

export const race = c
    .simpleSet
    .done();

export const spellSchool = c
    .simple
    .id('spell-school')
    .alt('school')
    .done();

export const techLevel = c
    .number
    .id('tech-level')
    .done();

export const raceBucket = c
    .simple
    .id('race-bucket')
    .done();

export const mercenaryRole = c
    .simple
    .id('mercenary-role')
    .alt('role')
    .done();

export const mercenaryFaction = c
    .simple
    .id('mercenary-faction')
    .alt('faction')
    .done();

export const rarity = c
    .simple
    .id('rarity')
    .alt('r')
    .done();

export const artist = c
    .text
    .id('artist')
    .alt('a')
    .done();

export const change = c
    .op([':'])
    .qual([])
    .done();

export const order = c
    .simple
    .done();
