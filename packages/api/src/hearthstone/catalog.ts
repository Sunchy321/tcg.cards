import { oc } from '@orpc/contract';

import z from 'zod';

import { defineCatalogContract } from '../factory';

export const catalogProcedures = {
  'locale':          defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'format':          defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'class':           defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'type':            defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'race':            defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'spell-school':    defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'rarity':          defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'layout':          defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'full-image-type': defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'rune':            defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'quest-type':      defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
  'faction':         defineCatalogContract({ tags: ['Hearthstone', 'Catalog'] }),
};

export const catalogIndex = oc
  .route({
    method: 'GET',
    tags:   ['Hearthstone', 'Catalog'],
  })
  .output(z.string().array());

export const catalog = {
  // '' resolves /v1/hearthstone/catalog to the catalog index.
  '': catalogIndex,
  ...catalogProcedures,
};
