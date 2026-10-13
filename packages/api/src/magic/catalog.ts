import { oc } from '@orpc/contract';

import z from 'zod';

import { defineCatalogContract } from '../factory';

import { layout, locale, rarity } from '@tcg-cards/model/magic/schema/basic';
import { category } from '@tcg-cards/model/magic/schema/card';
import { legality } from '@tcg-cards/model/magic/schema/announcement';

const catalogContract = (schema: z.ZodTypeAny) => defineCatalogContract({ tags: ['Magic', 'Catalog'], output: schema.array() });

export const catalogProcedures = {
  'category':    catalogContract(category),
  'rarity':      catalogContract(rarity),
  'layout':      catalogContract(layout),
  'locale':      catalogContract(locale),
  'legality':    catalogContract(legality),
  'format':      catalogContract(z.string()),
  'color':       catalogContract(z.string()),
  'mana-symbol': catalogContract(z.string()),
  'symbol':      catalogContract(z.string()),
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
