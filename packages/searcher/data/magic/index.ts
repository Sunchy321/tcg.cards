import { Model, defineModel } from '../../src/model';
import {
    allOperator, defineCommand, defaultOperator, defaultQualifier,
} from '../../src/command';

import * as builtin from '../../src/command/builtin';
import * as magic from './command';

const raw = defineCommand({ id: '', operators: [] });

const stats = defineCommand({
    id:         'stats',
    pattern:    '{{power}}/{{toughness}}' as const,
    operators:  allOperator,
    qualifiers: defaultQualifier,
});

const hash = defineCommand({
    id:         'hash',
    pattern:    '#{{tag}}' as const,
    operators:  [':'],
    qualifiers: defaultQualifier,
});

const set = builtin.simple({ id: 'set', alt: ['expansion', 's', 'e'] });
const num = builtin.simple({ id: 'number', alt: 'num' });
const lang = builtin.simple({ id: 'lang', alt: ['l'] });

const cost = magic.cost({ id: 'cost', alt: ['mana', 'mana-cost', 'm'] });
const manaValue = builtin.number({ id: 'mana-value', alt: ['mv', 'cmc'] });

const color = magic.color({ id: 'color', alt: ['c'] });
const colorIdentity = magic.color({ id: 'color-identity', alt: ['cd'] });
const colorIndicator = magic.color({ id: 'color-indicator', alt: ['indicator', 'ci'] });

const power = magic.halfNumber({ id: 'power', alt: ['pow'] });
const toughness = magic.halfNumber({ id: 'toughness', alt: ['tou'] });

const loyalty = defineCommand({
    id:         'loyalty',
    alt:        'loy',
    pattern:    '[{{loyalty}}]' as const,
    operators:  allOperator,
    qualifiers: defaultQualifier,
});

const defense = defineCommand({
    id:         'defense',
    alt:        'def',
    pattern:    '<{{defense}}>' as const,
    operators:  allOperator,
    qualifiers: defaultQualifier,
});

const name = defineCommand({
    id:        'name',
    alt:       'n',
    modifiers: {
        oracle:  'o',
        unified: 'u',
        printed: 'p',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const type = defineCommand({
    id:        'type',
    alt:       't',
    modifiers: {
        oracle:  'o',
        unified: 'u',
        printed: 'p',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const text = defineCommand({
    id:        'text',
    alt:       'x',
    modifiers: {
        oracle:  'o',
        unified: 'u',
        printed: 'p',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const oracle = defineCommand({
    id:         '!text-oracle',
    alt:        'o',
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const flavorText = builtin.text({ id: 'flavor-text', alt: ['flavor', 'ft'] });
const flavorName = builtin.text({ id: 'flavor-name', alt: 'fn' });
const layout = builtin.simple({ id: 'layout' });

const rarity = defineCommand({
    id:         'rarity',
    alt:        ['r'],
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
});

const format = defineCommand({
    id:         'format',
    alt:        ['f'],
    operators:  [':'] as const,
    qualifiers: defaultQualifier,
});

const counter = defineCommand({
    id:         'counter',
    operators:  [':'],
    qualifiers: defaultQualifier,
});

const keyword = defineCommand({
    id:        'keyword',
    operators: [':'],
});

const order = defineCommand({
    id:        'order',
    operators: [':'],
});

export const commands = {
    raw,
    stats,
    hash,
    set,
    num,
    lang,
    cost,
    manaValue,
    color,
    colorIdentity,
    colorIndicator,
    power,
    toughness,
    loyalty,
    defense,
    name,
    type,
    text,
    oracle,
    flavorText,
    flavorName,
    layout,
    rarity,
    format,
    counter,
    keyword,
    order,
};

export default defineModel({
    commands: Object.values(commands) as Model['commands'],
});
