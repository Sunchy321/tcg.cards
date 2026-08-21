import { oc } from '@orpc/contract';

import z from 'zod';

import { defineCatalogContract } from '../factory';

import { classes, format, fullImageType, layout, locale, race, rarity, spellSchool, types } from '@tcg-cards/model/hearthstone/schema/basic';
import { faction, questType, rune } from '@tcg-cards/model/hearthstone/schema/entity';

const catalogContract = (schema: z.ZodTypeAny) => defineCatalogContract({ tags: ['Hearthstone', 'Catalog'], output: schema.array() });

export const catalogProcedures = {
  'locale':          catalogContract(locale),
  'format':          catalogContract(format),
  'class':           catalogContract(classes),
  'type':            catalogContract(types),
  'race':            catalogContract(race),
  'spell-school':    catalogContract(spellSchool),
  'rarity':          catalogContract(rarity),
  'layout':          catalogContract(layout),
  'full-image-type': catalogContract(fullImageType),
  'rune':            catalogContract(rune),
  'quest-type':      catalogContract(questType),
  'faction':         catalogContract(faction),
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
