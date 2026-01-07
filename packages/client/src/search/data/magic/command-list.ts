import { cc as create } from '../../command/builder';

import * as builtin from '../../command/builtin';
import * as magic from './command';

import { model } from '@model/magic/search';

const cc = create
    .with(model)
    .use({ ...builtin, ...magic });

export const raw = cc
    .commands.raw
    .explain((args, i18n) => {
        const { value } = args;
        return i18n('$.full-command.raw', { value });
    });

export const stats = cc
    .commands.stats
    .explain((args, i18n) => {
        const { pattern } = args;
        if (pattern == null) {
            return undefined;
        }

        const { power, toughness } = pattern;

        return i18n('$.full-command.stats', { power, toughness });
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

export const set = cc
    .commands.set
    .apply({ id: 'set' });

export const number = cc
    .commands.number
    .apply({ id: 'number' });

export const lang = cc
    .commands.lang
    .apply({ id: 'lang' });

export const manaCost = cc
    .commands.manaCost
    .apply({ id: 'cost' });

export const manaValue = cc
    .commands.manaValue
    .apply({ id: 'mana-value' });

export const color = cc
    .commands.color
    .apply({ id: 'color', map: true });

export const colorIdentity = cc
    .commands.colorIdentity
    .apply({ id: 'color-identity', map: true });

export const colorIndicator = cc
    .commands.colorIndicator
    .apply({ id: 'color-indicator', map: true });

export const power = cc
    .commands.power
    .apply({ id: 'power' });

export const toughness = cc
    .commands.toughness
    .apply({ id: 'toughness' });

export const loyalty = cc
    .commands.loyalty
    .explain((args, i18n) => {
        const { pattern } = args;
        if (pattern != null) {
            const { loyalty } = pattern;
            return i18n('$.full-command.loyalty-pattern', { loyalty });
        }
        return builtin.simple.call({ args: args as any, meta: { id: 'loyalty' }, i18n });
    });

export const defense = cc
    .commands.defense
    .explain((args, i18n) => {
        const { pattern } = args;
        if (pattern != null) {
            const { defense } = pattern;
            return i18n('$.full-command.defense-pattern', { defense });
        }
        return builtin.simple.call({ args: args as any, meta: { id: 'defense' }, i18n });
    });

export const name = cc
    .commands.name
    .apply({ id: 'name' });

export const type = cc
    .commands.type
    .apply({ id: 'type' });

export const text = cc
    .commands.text
    .apply({ id: 'text' });

export const oracle = cc
    .commands.oracle
    .apply({ id: 'oracle' });

export const flavorText = cc
    .commands.flavorText
    .apply({ id: 'flavor-text' });

export const flavorName = cc
    .commands.flavorName
    .apply({ id: 'flavor-name' });

export const layout = cc
    .commands.layout
    .apply({ id: 'layout', map: true });

export const imageStatus = cc
    .commands.imageStatus
    .apply({ id: 'image-status', map: true });

export const rarity = cc
    .commands.rarity
    .apply({ id: 'rarity', map: true });

export const date = cc
    .commands.date
    .apply({ id: 'release-date' });

export const format = cc
    .commands.format
    .apply({ id: 'format', map: true });

export const counter = cc
    .commands.counter
    .apply({ id: 'counter', map: true });

export const keyword = cc
    .commands.keyword
    .apply({ id: 'keyword', map: true });

export const multiverseId = cc
    .commands.multiverseId
    .apply({ id: 'multiverse-id' });

export const order = cc
    .commands.order
    .apply({ id: 'order' });
