import { oc } from '@orpc/contract';

import z from 'zod';

import { defineCatalogContract } from '../factory';

export const catalogProcedures = {
  'category':    defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'rarity':      defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'layout':      defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'locale':      defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'legality':    defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'format':      defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'color':       defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'mana-symbol': defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
  'symbol':      defineCatalogContract({ tags: ['Magic', 'Catalog'] }),
};

export const catalogIndex = oc
  .route({
    method: 'GET',
    tags:   ['Magic', 'Catalog'],
  })
  .output(z.string().array());

export const catalog = {
  // '' resolves /v1/magic/catalog to the catalog index.
  '': catalogIndex,
  ...catalogProcedures,
};
