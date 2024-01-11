import { defineModel } from '../../src/model';
import {
    defineCommand, allOperator, defaultOperator, defaultQualifier,
} from '../../src/command';

import * as builtin from '../../src/command/builtin';

const raw = defineCommand({ id: '', operators: [''] });

const stats = defineCommand({
    id:         'stats',
    pattern:    '{{attack}}/{{health}}',
    operators:  ['', ...allOperator],
    qualifiers: defaultQualifier,
});

const fullStats = defineCommand({
    id:         'full-stats',
    pattern:    '{{cost}}/{{attack}}/{{health}}',
    operators:  [':', ''],
    qualifiers: defaultQualifier,
});

const name = builtin.text({ id: 'name', alt: 'n' });
const text = builtin.text({ id: 'text', alt: 'x' });

const flavorText = builtin.text({ id: 'flavor-text', alt: ['flavor', 'ft'] });

const set = builtin.simple({ id: 'set', alt: 's' });
const classes = builtin.simple({ id: 'class', alt: 'cl' });
const type = builtin.simple({ id: 'type', alt: 't' });

const cost = builtin.number({ id: 'cost', alt: 'c' });
const attack = builtin.number({ id: 'attack', alt: 'a' });
const health = builtin.number({ id: 'health', alt: 'h' });
const durability = builtin.number({ id: 'durability', alt: 'd' });
const armor = builtin.number({ id: 'armor', alt: 'm' });

const rune = builtin.simpleSet({
    id:       'rune',
    valueMap: {
        blood:  'b',
        frost:  'f',
        undead: 'u',
    },
});

const race = builtin.simple({ id: 'race' });
const spellSchool = builtin.simple({ id: 'spell-school', alt: 'school' });

const techLevel = builtin.number({ id: 'tech-level' });
const raceBucket = builtin.simple({ id: 'race-bucket' });

const mercenaryRole = builtin.simple({ id: 'mercenary-role', alt: 'role' });
const mercenaryFaction = builtin.simple({ id: 'mercenary-faction', alt: 'faction' });

const rarity = builtin.simple({ id: 'rarity', alt: 'r' });

const artist = builtin.text({ id: 'artist', alt: 'a' });

const change = defineCommand({
    id:         'change',
    operators:  defaultOperator,
    qualifiers: [],
});

export const commands = {
    raw,
    stats,
    fullStats,
    name,
    text,
    flavorText,
    set,
    classes,
    type,
    cost,
    attack,
    health,
    durability,
    armor,
    rune,
    race,
    spellSchool,
    techLevel,
    raceBucket,
    mercenaryRole,
    mercenaryFaction,
    rarity,
    artist,
    change,
};

export default defineModel({
    id:       'hearthstone',
    commands: Object.values(commands),
});
