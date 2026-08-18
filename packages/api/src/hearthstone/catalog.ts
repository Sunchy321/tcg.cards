import { os } from '@orpc/server';

import z from 'zod';

import { defineConstants } from '../factory';

import {
  classes,
  format,
  fullImageType,
  layout,
  locale,
  rarity,
  race,
  spellSchool,
  types,
} from '@tcg-cards/model/src/hearthstone/schema/basic';
import { faction, questType, rune } from '@tcg-cards/model/src/hearthstone/schema/entity';

const catalogProcedures = {
  'locale':          defineConstants({ description: 'Supported locales', tags: ['Hearthstone', 'Constants'], values: locale.options }),
  'format':          defineConstants({ description: 'Formats', tags: ['Hearthstone', 'Constants'], values: format.options }),
  'class':           defineConstants({ description: 'Card classes', tags: ['Hearthstone', 'Constants'], values: classes.options }),
  'type':            defineConstants({ description: 'Card types', tags: ['Hearthstone', 'Constants'], values: types.options }),
  'race':            defineConstants({ description: 'Races', tags: ['Hearthstone', 'Constants'], values: race.options }),
  'spell-school':    defineConstants({ description: 'Spell schools', tags: ['Hearthstone', 'Constants'], values: spellSchool.options }),
  'rarity':          defineConstants({ description: 'Rarities', tags: ['Hearthstone', 'Constants'], values: rarity.options }),
  'layout':          defineConstants({ description: 'Card layouts', tags: ['Hearthstone', 'Constants'], values: layout.options }),
  'full-image-type': defineConstants({ description: 'Full image types', tags: ['Hearthstone', 'Constants'], values: fullImageType.options }),
  'rune':            defineConstants({ description: 'Runes', tags: ['Hearthstone', 'Constants'], values: rune.options }),
  'quest-type':      defineConstants({ description: 'Quest types', tags: ['Hearthstone', 'Constants'], values: questType.options }),
  'faction':         defineConstants({ description: 'Factions', tags: ['Hearthstone', 'Constants'], values: faction.options }),
};

const catalogIndex = os
  .route({
    method:      'GET',
    description: 'List supported hearthstone catalogs',
    tags:        ['Hearthstone', 'Constants'],
  })
  .output(z.string().array())
  .handler(async () => Object.keys(catalogProcedures));

export const catalog = {
  // '' resolves /v1/hearthstone/catalog to the catalog index.
  '': catalogIndex,
  ...catalogProcedures,
};
