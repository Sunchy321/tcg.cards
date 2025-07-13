import { defineModel } from '../../src/model';
import {
    defineCommand, allOperator, defaultOperator, defaultQualifier,
} from '../../src/command';

import * as builtin from '../../src/command/builtin';
import * as magic from './command';

const raw = defineCommand({ id: '', operators: [''], allowRegex: true });

const stats = defineCommand({
    id:         'stats',
    pattern:    '{{power}}/{{toughness}}' as const,
    operators:  ['', ...allOperator],
    qualifiers: defaultQualifier,
});

const hash = defineCommand({
    id:         'hash',
    pattern:    '#{{tag}}' as const,
    operators:  [':', ''],
    qualifiers: defaultQualifier,
});

const set = builtin.simple({ id: 'set', alt: ['expansion', 's', 'e'] });
const num = builtin.simple({ id: 'number', alt: 'num' });
const lang = builtin.simple({ id: 'lang', alt: ['l'] });

const cost = magic.cost({ id: 'cost', alt: ['mana', 'mana-cost', 'm'] });
const manaValue = builtin.number({ id: 'mana-value', alt: ['mv', 'cmc'] });

const color = magic.color({ id: 'color', alt: ['c'] });
const colorIdentity = magic.color({ id: 'color-identity', alt: ['identity', 'cd'] });
const colorIndicator = magic.color({ id: 'color-indicator', alt: ['indicator', 'ci'] });

const power = magic.halfNumber({ id: 'power', alt: ['pow'] });
const toughness = magic.halfNumber({ id: 'toughness', alt: ['tou'] });

const loyalty = defineCommand({
    id:         'loyalty',
    alt:        'loy',
    pattern:    '[{{loyalty}}]' as const,
    operators:  ['', ...allOperator],
    qualifiers: defaultQualifier,
});

const defense = defineCommand({
    id:         'defense',
    alt:        'def',
    pattern:    '<{{defense}}>' as const,
    operators:  ['', ...allOperator],
    qualifiers: defaultQualifier,
});

const name = defineCommand({
    id:        'name',
    alt:       'n',
    modifiers: {
        oracle:  'on',
        unified: 'un',
        printed: 'pn',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const type = defineCommand({
    id:        'type',
    alt:       't',
    modifiers: {
        oracle:  'ot',
        unified: 'ut',
        printed: 'pt',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const text = defineCommand({
    id:        'text',
    alt:       'x',
    modifiers: {
        oracle:  'ox',
        unified: 'ux',
        printed: 'px',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const oracle = defineCommand({
    id:         'oracle',
    alt:        'o',
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const flavorText = builtin.text({ id: 'flavor-text', alt: ['flavor', 'ft'] });
const flavorName = builtin.text({ id: 'flavor-name', alt: 'fn' });
const layout = builtin.simple({ id: 'layout' });
const imageStatus = builtin.simple({ id: 'image-status' });

const rarity = defineCommand({
    id:         'rarity',
    alt:        'r',
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
});

const date = defineCommand({
    id:         'release-date',
    alt:        'date',
    operators:  allOperator,
    qualifiers: defaultQualifier,
});

const format = defineCommand({
    id:         'format',
    alt:        ['f'],
    operators:  [':'],
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

const multiverseId = defineCommand({
    id:        'multiverse-id',
    alt:       ['mid'],
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
    imageStatus,
    rarity,
    date,
    format,
    counter,
    keyword,
    multiverseId,
    order,
};

export default defineModel({
    id:       'magic',
    commands: Object.values(commands),
});
