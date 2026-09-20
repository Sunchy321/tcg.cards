import { cc as create } from '#search/client/command/builder';

import * as builtin from '#search/client/command/builtin';
import * as magic from './command';

import { model } from '#model/magic/search';

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

export const print = cc
  .commands.print
  .explain((args, i18n) => {
    const text = String(args.value ?? '');
    const parts = text.toLowerCase().split('#');
    const [set, number, lang] = parts as [string?, string?, string?];
    const wellFormed = (parts.length === 2 || parts.length === 3)
      && set != null && /^[a-z0-9]+$/.test(set)
      && number != null && number !== ''
      && (parts.length === 2 || (lang != null && /^[a-z]+$/.test(lang)));

    // Same shape rule as the server handler: anything else is a plain text search.
    if (!wellFormed) {
      return i18n('$.full-command.raw', { value: text });
    }

    if (lang != null) {
      return i18n('$.full-command.print-lang', { set: set!, number: number!, lang });
    }
    return i18n('$.full-command.print', { set: set!, number: number! });
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
  .apply({ id: 'color', map: c => `{${c.toUpperCase()}}` });

export const colorIdentity = cc
  .commands.colorIdentity
  .apply({ id: 'color-identity', map: c => `{${c.toUpperCase()}}` });

export const colorIndicator = cc
  .commands.colorIndicator
  .apply({ id: 'color-indicator', map: c => `{${c.toUpperCase()}}` });

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
  .apply({ id: 'layout', mapValue: true });

export const imageStatus = cc
  .commands.imageStatus
  .apply({ id: 'image-status', mapValue: true });

export const rarity = cc
  .commands.rarity
  .apply({ id: 'rarity', mapValue: true });

export const date = cc
  .commands.date
  .explain((args, i18n) => {
    const { value, operator, qualifier } = args;

    const commandText = i18n('$.command.release-date');

    const operatorMap: Record<string, string> = {
      '=':  'is',
      ':':  'is',
      '!=': 'is-not',
      '!:': 'is-not',
      '>':  'greater-than',
      '>=': 'greater-equal',
      '<':  'less-than',
      '<=': 'less-equal',
    };

    const realOperator = qualifier.includes('!') ? `!${operator}` : operator;
    const operatorId = operatorMap[realOperator] ?? realOperator;
    const operatorText = i18n(`operator.${operatorId}`);

    return `${commandText}${operatorText}${value}`;
  });

export const format = cc
  .commands.format
  .explain((args, i18n) => {
    const { value, qualifier } = args;

    if (typeof value === 'string' && value.includes('=')) {
      const [fmt, status] = value.split('=');
      const fmtText = i18n(`#.format.${fmt}`) ?? fmt;
      const statusText = i18n(`#.legality.${status}`) ?? status;

      if (!qualifier.includes('!')) {
        return i18n('$.full-command.format-with-status', { format: fmtText, status: statusText });
      } else {
        return i18n('$.full-command.format-with-status-not', { format: fmtText, status: statusText });
      }
    } else {
      const fmtText = i18n(`#.format.${value}`) ?? value;

      return i18n('$.full-command.format-available', { format: fmtText });
    }
  });

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
