import { os } from '../../orpc';

import { category } from '@tcg-cards/model/magic/schema/card';
import { legality } from '@tcg-cards/model/magic/schema/announcement';
import {
  colors,
  formats,
  layout,
  locale,
  manaSymbols,
  rarity,
  symbols,
} from '@tcg-cards/model/magic/schema/basic';

const values = {
  'category':    category.options,
  'rarity':      rarity.options,
  'layout':      layout.options,
  'locale':      locale.options,
  'legality':    legality.options,
  'format':      formats,
  'color':       colors,
  'mana-symbol': manaSymbols,
  'symbol':      symbols,
};

const index = os.magic.catalog['']
  .handler(async () => Object.keys(values));

export const catalog = {
  // '' resolves /v1/magic/catalog to the catalog index.
  '':            index,
  'category':    os.magic.catalog.category.handler(async () => [...(values['category'] ?? [])]),
  'rarity':      os.magic.catalog.rarity.handler(async () => [...(values['rarity'] ?? [])]),
  'layout':      os.magic.catalog.layout.handler(async () => [...(values['layout'] ?? [])]),
  'locale':      os.magic.catalog.locale.handler(async () => [...(values['locale'] ?? [])]),
  'legality':    os.magic.catalog.legality.handler(async () => [...(values['legality'] ?? [])]),
  'format':      os.magic.catalog.format.handler(async () => [...(values['format'] ?? [])]),
  'color':       os.magic.catalog.color.handler(async () => [...(values['color'] ?? [])]),
  'mana-symbol': os.magic.catalog['mana-symbol'].handler(async () => [...(values['mana-symbol'] ?? [])]),
  'symbol':      os.magic.catalog.symbol.handler(async () => [...(values['symbol'] ?? [])]),
};
