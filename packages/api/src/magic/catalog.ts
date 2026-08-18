import { os } from '@orpc/server';

import z from 'zod';

import { defineConstants } from '../factory';

import { category } from '@tcg-cards/model/src/magic/schema/card';
import { legality } from '@tcg-cards/model/src/magic/schema/announcement';
import {
  colors,
  formats,
  layout,
  locale,
  manaSymbols,
  rarity,
  symbols,
} from '@tcg-cards/model/src/magic/schema/basic';

const catalogProcedures = {
  'category':    defineConstants({ description: 'Card categories', tags: ['Magic', 'Constants'], values: category.options }),
  'rarity':      defineConstants({ description: 'Rarities', tags: ['Magic', 'Constants'], values: rarity.options }),
  'layout':      defineConstants({ description: 'Card layouts', tags: ['Magic', 'Constants'], values: layout.options }),
  'locale':      defineConstants({ description: 'Supported locales', tags: ['Magic', 'Constants'], values: locale.options }),
  'legality':    defineConstants({ description: 'Legalities', tags: ['Magic', 'Constants'], values: legality.options }),
  'format':      defineConstants({ description: 'Formats', tags: ['Magic', 'Constants'], values: formats }),
  'color':       defineConstants({ description: 'Colors', tags: ['Magic', 'Constants'], values: colors }),
  'mana-symbol': defineConstants({ description: 'Mana symbols', tags: ['Magic', 'Constants'], values: manaSymbols }),
  'symbol':      defineConstants({ description: 'All symbols', tags: ['Magic', 'Constants'], values: symbols }),
};

const catalogIndex = os
  .route({
    method:      'GET',
    description: 'List supported magic catalogs',
    tags:        ['Magic', 'Constants'],
  })
  .output(z.string().array())
  .handler(async () => Object.keys(catalogProcedures));

export const catalog = {
  // '' resolves /v1/magic/catalog to the catalog index.
  '': catalogIndex,
  ...catalogProcedures,
};
