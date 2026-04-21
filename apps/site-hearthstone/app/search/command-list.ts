import { cc as create } from '#search/client/command/builder';
import { defaultTranslate } from '#search/client/translate';

import * as builtin from '#search/client/command/builtin';

import { model } from '#model/hearthstone/search';

const cc = create
  .with(model)
  .use({ ...builtin });

export const raw = cc
  .commands.raw
  .explain((args, i18n) => {
    return i18n('$.full-command.raw', { value: args.value });
  });

export const fullStats = cc
  .commands.fullStats
  .explain((args, i18n) => {
    const { pattern } = args;

    if (pattern == null) {
      return '';
    }

    return i18n('$.full-command.full-stats', pattern);
  });

export const stats = cc
  .commands.stats
  .explain((args, i18n) => {
    const { pattern } = args;

    if (pattern == null) {
      return '';
    }

    return i18n('$.full-command.stats', pattern);
  });

export const hash = cc
  .commands.hash
  .explain((args, i18n) => {
    const { pattern, value } = args;
    const tag = pattern?.tag ?? value;

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
  .apply({ id: 'flavor-text' });

export const set = cc
  .commands.set
  .apply({ id: 'set' });

export const classes = cc
  .commands.classes
  .apply({ id: 'class', map: true });

export const type = cc
  .commands.type
  .apply({ id: 'type', mapValue: true });

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
  .apply({ id: 'spell-school', mapValue: true });

export const techLevel = cc
  .commands.techLevel
  .apply({ id: 'tech-level' });

export const raceBucket = cc
  .commands.raceBucket
  .apply({ id: 'race-bucket', mapValue: true });

export const mercenaryRole = cc
  .commands.mercenaryRole
  .apply({ id: 'mercenary-role', mapValue: true });

export const mercenaryFaction = cc
  .commands.mercenaryFaction
  .apply({ id: 'mercenary-faction', mapValue: true });

export const rarity = cc
  .commands.rarity
  .apply({ id: 'rarity', mapValue: true });

export const artist = cc
  .commands.artist
  .apply({ id: 'artist' });

export const change = cc
  .commands.change
  .explain((args, i18n) => {
    return defaultTranslate(args, i18n, 'change', { ':': 'is' });
  });

export const format = cc
  .commands.format
  .explain((args, i18n) => {
    const { value, qualifier } = args;

    if (typeof value === 'string' && value.includes('=')) {
      const [fmt, status] = value.split('=');
      const formatText = i18n(`#.format.${fmt}`) ?? fmt;
      const statusText = i18n(`#.legality.${status}`) ?? status;

      if (!qualifier.includes('!')) {
        return i18n('$.full-command.format-with-status', { format: formatText, status: statusText });
      }

      return i18n('$.full-command.format-with-status-not', { format: formatText, status: statusText });
    }

    const formatText = i18n(`#.format.${value}`) ?? value;
    return i18n('$.full-command.format-available', { format: formatText });
  });

export const order = cc
  .commands.order
  .explain((args, i18n) => {
    const rawValue = String(args.value);
    const items = rawValue.split(',').map(part => {
      if (part.endsWith('+')) {
        const key = part.slice(0, -1);
        return i18n('$.full-command.order-ascending', {
          value: i18n(`$.parameter.order.${key}`),
        });
      }

      if (part.endsWith('-')) {
        const key = part.slice(0, -1);
        return i18n('$.full-command.order-descending', {
          value: i18n(`$.parameter.order.${key}`),
        });
      }

      return i18n('$.full-command.order', {
        value: i18n(`$.parameter.order.${part}`),
      });
    });

    return items.join(', ');
  });
