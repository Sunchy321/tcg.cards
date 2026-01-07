import { cc as create } from 'src/search/command/builder';
import * as builtin from 'src/search/command/builtin';

// import type { I18N } from 'vue-i18n';

import { model } from '@model/yugioh/search';

const cc = create
    .with(model)
    .use({ ...builtin });

export const raw = cc
    .commands.raw
    .explain((args, i18n) => {
        return builtin.simple.call({ args, meta: { id: 'yugioh.search.command.raw' }, i18n });
    });

export const stats = cc
    .commands.stats
    .explain((args, i18n) => {
        const { qualifier } = args;

        if (qualifier != null && qualifier.length > 0) {
            const q = qualifier[0];

            if (q === '!') {
                return i18n('yugioh.search.command.stats.$has-exact');
            } else {
                return i18n('yugioh.search.command.stats.$has');
            }
        }

        return undefined;
    });

export const hash = cc.commands.hash.apply({ id: 'yugioh.search.command.hash' });

export const set = cc.commands.set.apply({ id: 'yugioh.search.command.set' });

export const number = cc.commands.number.apply({ id: 'yugioh.search.command.number' });

export const lang = cc.commands.lang.apply({ id: 'yugioh.search.command.lang' });

export const cost = cc.commands.cost.apply({ id: 'yugioh.search.command.cost' });

export const color = cc.commands.color.apply({ id: 'yugioh.search.command.color' });

export const lore = cc.commands.lore.apply({ id: 'yugioh.search.command.lore' });

export const strength = cc.commands.strength.apply({ id: 'yugioh.search.command.strength' });

export const willPower = cc.commands.willPower.apply({ id: 'yugioh.search.command.will-power' });

export const moveCost = cc.commands.moveCost.apply({ id: 'yugioh.search.command.move-cost' });

export const name = cc.commands.name.apply({ id: 'yugioh.search.command.name' });

export const type = cc.commands.type.apply({ id: 'yugioh.search.command.type' });

export const text = cc.commands.text.apply({ id: 'yugioh.search.command.text' });

export const flavorText = cc.commands.flavorText.apply({ id: 'yugioh.search.command.flavor-text' });

export const layout = cc.commands.layout.apply({ id: 'yugioh.search.command.layout' });

export const rarity = cc.commands.rarity.apply({ id: 'yugioh.search.command.rarity' });

export const order = cc.commands.order.apply({ id: 'yugioh.search.command.order' });
