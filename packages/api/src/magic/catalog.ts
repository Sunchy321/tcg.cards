import { oc } from '@orpc/contract';

import z from 'zod';

import { defineCatalogContract } from '../factory';

export const catalogProcedures = {
  'category':    defineCatalogContract({ description: 'Card categories', tags: ['Magic', 'Catalog'] }),
  'rarity':      defineCatalogContract({ description: 'Rarities', tags: ['Magic', 'Catalog'] }),
  'layout':      defineCatalogContract({ description: 'Card layouts', tags: ['Magic', 'Catalog'] }),
  'locale':      defineCatalogContract({ description: 'Supported locales', tags: ['Magic', 'Catalog'] }),
  'legality':    defineCatalogContract({ description: 'Legalities', tags: ['Magic', 'Catalog'] }),
  'format':      defineCatalogContract({ description: 'Formats', tags: ['Magic', 'Catalog'] }),
  'color':       defineCatalogContract({ description: 'Colors', tags: ['Magic', 'Catalog'] }),
  'mana-symbol': defineCatalogContract({ description: 'Mana symbols', tags: ['Magic', 'Catalog'] }),
  'symbol':      defineCatalogContract({ description: 'All symbols', tags: ['Magic', 'Catalog'] }),
};

export const catalogIndex = oc
  .route({
    method:      'GET',
    description: 'List supported magic catalogs',
    tags:        ['Magic', 'Catalog'],
  })
  .output(z.string().array());

export const catalog = {
  // '' resolves /v1/magic/catalog to the catalog index.
  '': catalogIndex,
  ...catalogProcedures,
};
