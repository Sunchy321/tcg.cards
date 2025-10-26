import { defineModel } from '@search/model';
import { defineCommand, allOperator, defaultOperator, defaultQualifier } from '@search/command';

import * as builtin from '@search/command/builtin';

const raw = defineCommand({ id: '', operators: [''], allowRegex: true });

const stats = defineCommand({
    id:         'stats',
    pattern:    '{{attack}}/{{defense}}' as const,
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

const cost = builtin.number({ id: 'cost', alt: ['c'] });

const color = builtin.simpleSet({ id: 'color' });

const lore = builtin.number({ id: 'lore' });
const strength = builtin.number({ id: 'strength', alt: ['st'] });
const willPower = builtin.number({ id: 'will-power', alt: ['w'] });
const moveCost = builtin.number({ id: 'move-cost', alt: ['mc'] });

const name = defineCommand({
    id:        'name',
    alt:       'n',
    modifiers: {
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
        unified: 'ux',
        printed: 'px',
    },
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
    allowRegex: true,
});

const flavorText = builtin.text({ id: 'flavor-text', alt: ['flavor', 'ft'] });
const layout = builtin.simple({ id: 'layout' });

const rarity = defineCommand({
    id:         'rarity',
    alt:        'r',
    operators:  defaultOperator,
    qualifiers: defaultQualifier,
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
    color,
    lore,
    strength,
    willPower,
    moveCost,
    name,
    type,
    text,
    flavorText,
    layout,
    rarity,
    order,
};

export default defineModel({
    id:       'yugioh',
    commands: Object.values(commands),
});
