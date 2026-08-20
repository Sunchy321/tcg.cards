import { oc } from '@orpc/contract';

import z from 'zod';

import { defineCatalogContract } from '../factory';

export const catalogProcedures = {
  'locale':          defineCatalogContract({ description: 'Supported locales', tags: ['Hearthstone', 'Catalog'] }),
  'format':          defineCatalogContract({ description: 'Formats', tags: ['Hearthstone', 'Catalog'] }),
  'class':           defineCatalogContract({ description: 'Card classes', tags: ['Hearthstone', 'Catalog'] }),
  'type':            defineCatalogContract({ description: 'Card types', tags: ['Hearthstone', 'Catalog'] }),
  'race':            defineCatalogContract({ description: 'Races', tags: ['Hearthstone', 'Catalog'] }),
  'spell-school':    defineCatalogContract({ description: 'Spell schools', tags: ['Hearthstone', 'Catalog'] }),
  'rarity':          defineCatalogContract({ description: 'Rarities', tags: ['Hearthstone', 'Catalog'] }),
  'layout':          defineCatalogContract({ description: 'Card layouts', tags: ['Hearthstone', 'Catalog'] }),
  'full-image-type': defineCatalogContract({ description: 'Full image types', tags: ['Hearthstone', 'Catalog'] }),
  'rune':            defineCatalogContract({ description: 'Runes', tags: ['Hearthstone', 'Catalog'] }),
  'quest-type':      defineCatalogContract({ description: 'Quest types', tags: ['Hearthstone', 'Catalog'] }),
  'faction':         defineCatalogContract({ description: 'Factions', tags: ['Hearthstone', 'Catalog'] }),
};

export const catalogIndex = oc
  .route({
    method:      'GET',
    description: 'List supported hearthstone catalogs',
    tags:        ['Hearthstone', 'Catalog'],
  })
  .output(z.string().array());

export const catalog = {
  // '' resolves /v1/hearthstone/catalog to the catalog index.
  '': catalogIndex,
  ...catalogProcedures,
};
