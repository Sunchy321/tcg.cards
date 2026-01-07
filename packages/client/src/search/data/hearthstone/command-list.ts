import { cc as create } from '../../command/builder';

import * as builtin from '../../command/builtin';

import { model } from '@model/hearthstone/search';

const cc = create
    .with(model)
    .use({ ...builtin });

export const raw = cc
    .commands.raw
    .explain((args, i18n) => {
        const { value } = args;
        return i18n('$.full-command.raw', { value });
    });

export const fullStats = cc
    .commands.fullStats
    .explain((args, i18n) => {
        const { pattern } = args;
        if (pattern == null) {
            return undefined;
        }

        const { cost, attack, health } = pattern;

        return i18n('$.full-command.full-stats', { cost, attack, health });
    });

export const stats = cc
    .commands.stats
    .explain((args, i18n) => {
        const { pattern } = args;
        if (pattern == null) {
            return undefined;
        }

        const { attack, health } = pattern;

        return i18n('$.full-command.stats', { attack, health });
    });

export const hash = cc
    .commands.hash
    .explain((args, i18n) => {
        const { pattern } = args;
        if (pattern == null) {
            return undefined;
        }

        const { tag } = pattern;

        return i18n('$.full-command.hash', { tag });
    });

export const lang = cc
    .commands.lang
    .apply({ id: 'lang' });

export const name = cc
    .commands.name
    .apply({ id: 'name' });

export const text = cc
    .commands.text
    .apply({ id: 'text' });

export const flavorText = cc
    .commands.flavorText
    .apply({ id: 'flavorText' });

export const set = cc
    .commands.set
    .apply({ id: 'set' });

export const classes = cc
    .commands.classes
    .apply({ id: 'classes', map: true });

export const type = cc
    .commands.type
    .apply({ id: 'type', map: true });

export const cost = cc
    .commands.cost
    .apply({ id: 'cost' });

export const attack = cc
    .commands.attack
    .apply({ id: 'attack' });

export const health = cc
    .commands.health
    .apply({ id: 'health' });

export const durability = cc
    .commands.durability
    .apply({ id: 'durability' });

export const armor = cc
    .commands.armor
    .apply({ id: 'armor' });

export const rune = cc
    .commands.rune
    .apply({ id: 'rune', map: true });

export const race = cc
    .commands.race
    .apply({ id: 'race', map: true });

export const spellSchool = cc
    .commands.spellSchool
    .apply({ id: 'spellSchool', map: true });

export const techLevel = cc
    .commands.techLevel
    .apply({ id: 'techLevel' });

export const raceBucket = cc
    .commands.raceBucket
    .apply({ id: 'raceBucket', map: true });

export const mercenaryRole = cc
    .commands.mercenaryRole
    .apply({ id: 'mercenaryRole', map: true });

export const mercenaryFaction = cc
    .commands.mercenaryFaction
    .apply({ id: 'mercenaryFaction', map: true });

export const rarity = cc
    .commands.rarity
    .apply({ id: 'rarity', map: true });

export const artist = cc
    .commands.artist
    .apply({ id: 'artist' });
