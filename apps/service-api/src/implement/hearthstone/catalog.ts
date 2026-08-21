import { os } from '../../orpc';

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
} from '@tcg-cards/model/hearthstone/schema/basic';
import { faction, questType, rune } from '@tcg-cards/model/hearthstone/schema/entity';

const values = {
  'locale':          locale.options,
  'format':          format.options,
  'class':           classes.options,
  'type':            types.options,
  'race':            race.options,
  'spell-school':    spellSchool.options,
  'rarity':          rarity.options,
  'layout':          layout.options,
  'full-image-type': fullImageType.options,
  'rune':            rune.options,
  'quest-type':      questType.options,
  'faction':         faction.options,
};

const index = os.hearthstone.catalog['']
  .handler(async () => Object.keys(values));

export const catalog = {
  // '' resolves /v1/hearthstone/catalog to the catalog index.
  '':                index,
  'locale':          os.hearthstone.catalog.locale.handler(() => [...values['locale']!]),
  'format':          os.hearthstone.catalog.format.handler(() => [...values['format']!]),
  'class':           os.hearthstone.catalog.class.handler(() => [...values['class']!]),
  'type':            os.hearthstone.catalog.type.handler(() => [...values['type']!]),
  'race':            os.hearthstone.catalog.race.handler(() => [...values['race']!]),
  'spell-school':    os.hearthstone.catalog['spell-school'].handler(() => [...values['spell-school']!]),
  'rarity':          os.hearthstone.catalog.rarity.handler(() => [...values['rarity']!]),
  'layout':          os.hearthstone.catalog.layout.handler(() => [...values['layout']!]),
  'full-image-type': os.hearthstone.catalog['full-image-type'].handler(() => [...values['full-image-type']!]),
  'rune':            os.hearthstone.catalog.rune.handler(() => [...values['rune']!]),
  'quest-type':      os.hearthstone.catalog['quest-type'].handler(() => [...values['quest-type']!]),
  'faction':         os.hearthstone.catalog.faction.handler(() => [...values['faction']!]),
};
