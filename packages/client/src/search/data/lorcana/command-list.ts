import { cc as create } from 'src/search/command/builder';

import * as builtin from 'src/search/command/builtin';

import { model } from '@model/lorcana/search';

const cc = create
    .with(model)
    .use({ ...builtin });

export const raw = cc
    .commands.raw
    .explain((arg, i18n) => {
        return builtin.simple.call({ args: arg as any, meta: { id: 'lorcana.search.command.raw' }, i18n });
    });

export const fullStats = cc
    .commands.fullStats
    .explain((arg, i18n) => {
        const { qualifier } = arg;

        if (qualifier != null && qualifier.length > 0) {
            const q = qualifier[0];

            if (q === '!') {
                return i18n('lorcana.search.command.full-stats.$has-exact');
            } else {
                return i18n('lorcana.search.command.full-stats.$has');
            }
        }

        return undefined;
    });

export const stats = cc
    .commands.stats
    .explain((arg, i18n) => {
        const { qualifier } = arg;

        if (qualifier != null && qualifier.length > 0) {
            const q = qualifier[0];

            if (q === '!') {
                return i18n('lorcana.search.command.stats.$has-exact');
            } else {
                return i18n('lorcana.search.command.stats.$has');
            }
        }

        return undefined;
    });

export const hash = cc
    .commands.hash
    .apply({ id: 'lorcana.search.command.hash' });

export const set = cc
    .commands.set
    .apply({ id: 'lorcana.search.command.set' });

export const number = cc
    .commands.number
    .apply({ id: 'lorcana.search.command.number' });

export const lang = cc
    .commands.lang
    .apply({ id: 'lorcana.search.command.lang' });

export const cost = cc
    .commands.cost
    .apply({ id: 'lorcana.search.command.cost' });

export const color = cc
    .commands.color
    .apply({ id: 'lorcana.search.command.color' });

export const lore = cc
    .commands.lore
    .apply({ id: 'lorcana.search.command.lore' });

export const strength = cc
    .commands.strength
    .apply({ id: 'lorcana.search.command.strength' });

export const willPower = cc
    .commands.willPower
    .apply({ id: 'lorcana.search.command.will-power' });

export const moveCost = cc
    .commands.moveCost
    .apply({ id: 'lorcana.search.command.move-cost' });

export const name = cc
    .commands.name
    .apply({ id: 'lorcana.search.command.name' });

export const type = cc
    .commands.type
    .apply({ id: 'lorcana.search.command.type' });

export const text = cc
    .commands.text
    .apply({ id: 'lorcana.search.command.text' });

export const flavorText = cc
    .commands.flavorText
    .apply({ id: 'lorcana.search.command.flavor-text' });

export const layout = cc
    .commands.layout
    .apply({ id: 'lorcana.search.command.layout' });

export const rarity = cc
    .commands.rarity
    .apply({ id: 'lorcana.search.command.rarity' });
