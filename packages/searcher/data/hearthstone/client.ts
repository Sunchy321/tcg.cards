import { defineClientModel } from '../../src/model/client';
import { defineClientCommand, CommonClientCommand } from '../../src/command/client';

import * as builtin from '../../src/command/builtin/client';

import model, { commands } from './index';

import { defaultTranslate } from '../../src/model/client/translate';

import { textMap } from '../../src/command/builtin/text/client';

const raw = defineClientCommand({
    command: commands.raw,
    explain({ parameter }, i18n) {
        if (typeof parameter === 'string' && /^(\{[^}]+\})+$/.test(parameter)) {
            return i18n('$.full-command.raw-mana', { parameter });
        } else {
            return i18n('$.full-command.raw', { parameter });
        }
    },
});

const stats = defineClientCommand({
    command: commands.stats,
    explain({ pattern: { attack, health } }, i18n) {
        return i18n('$.full-command.stats', { attack, health });
    },
});

const fullStats = defineClientCommand({
    command: commands.fullStats,
    explain({ pattern: { cost, attack, health } }, i18n) {
        return i18n('$.full-command.full-stats', { cost, attack, health });
    },
});

const hash = defineClientCommand({
    command: commands.hash,
    explain({ pattern:{ tag } }, i18n) {
        return i18n('$.full-command.hash', { tag });
    },
});

const name = defineClientCommand(commands.name);
const text = defineClientCommand(commands.text);

const flavorText = defineClientCommand(commands.flavorText);

const set = defineClientCommand(commands.set);
const classes = defineClientCommand(commands.classes);
const type = defineClientCommand(commands.type);

const cost = defineClientCommand(commands.cost);
const attack = defineClientCommand(commands.attack);
const health = defineClientCommand(commands.health);
const durability = defineClientCommand(commands.durability);
const armor = defineClientCommand(commands.armor);

const rune = defineClientCommand(commands.rune);

const race = defineClientCommand(commands.race);
const spellSchool = defineClientCommand(commands.spellSchool);

const techLevel = defineClientCommand(commands.techLevel);
const raceBucket = defineClientCommand(commands.raceBucket);

const mercenaryRole = defineClientCommand(commands.mercenaryRole);
const mercenaryFaction = defineClientCommand(commands.mercenaryFaction);

const rarity = defineClientCommand(commands.rarity);
const artist = defineClientCommand(commands.artist);

const clientCommands: Record<string, CommonClientCommand> = {
    raw,
    stats,
    fullStats,
    hash,
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
};

export default defineClientModel({
    id:       model.id,
    commands: Object.values(clientCommands),
});
