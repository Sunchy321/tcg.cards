import { describe, expect, test } from 'bun:test';

import { runProjection } from './runner';
import type { CardProjectionInput } from './runner';

// Hand-written regression fixture: a mercenary ability that summons a minion.
// Tag 1676 (LETTUCE_ABILITY_SUMMONED_MINION) is a render mechanic whose value
// is a card reference; it is configured to emit the
// `lettuce_ability_summoned_minion` relation, and the summoned minion's dbfId
// must still reach renderModel.renderMechanics so the renderer and placeholder
// logic can pick the mercenary-ability-minion presentation.
const input: CardProjectionInput = {
  build: 240397,
  card:  {
    cardId:                   'MERC_ABILITY_1',
    dbfId:                    900001,
    textBuilderType:          0,
    artistName:               null,
    signatureArtistName:      null,
    creditsCardName:          null,
    watermarkTextureOverride: null,
    suggestionWeight:         0,
    changeVersion:            0,
    name:                     {
      m_locId:     1,
      m_locValues: ['Summon a companion'],
    },
    textInHand: {
      m_locId:     2,
      m_locValues: ['Summon a {0}.'],
    },
    flavorText:            null,
    howToGetCard:          null,
    howToGetGoldCard:      null,
    howToGetSignatureCard: null,
    howToGetDiamondCard:   null,
    targetArrowText:       null,
  },
  tags: [
    {
      dbfId:             900001,
      tagId:             202,
      tagValue:          23,
      isReferenceTag:    false,
      isPowerKeywordTag: false,
    },
    {
      dbfId:             900001,
      tagId:             1676,
      tagValue:          900002,
      isReferenceTag:    false,
      isPowerKeywordTag: false,
    },
  ],
  tagMap: {
    202: {
      enumId:          202,
      slug:            'type',
      normalizeKind:   'enum_from_int',
      normalizeConfig: {
        enumMap: {
          23: 'mercenary_ability',
        },
      },
      projectTargetType: 'entity',
      projectTargetPath: 'type',
      projectKind:       'assign_value',
      projectConfig:     {},
    },
    1676: {
      enumId:            1676,
      slug:              'lettuce-ability-summoned-minion',
      normalizeKind:     'card_ref_from_int',
      normalizeConfig:   {},
      projectTargetType: 'entity_relation',
      projectTargetPath: 'lettuce_ability_summoned_minion',
      projectKind:       'emit_relation',
      projectConfig:     {},
    },
  },
  context: {
    cardIdByDbfId: {
      900002: 'MERC_MINION_1',
    },
    setIdByDbfId:            {},
    hsdataSetByDbfId:        {},
    nameByDbfIdByLocale:     {},
    richTextByDbfIdByLocale: {},
  },
};

describe('merc-ability-summoned-minion', () => {
  test('emits the summoned-minion relation from tag 1676', () => {
    const result = runProjection(input);

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({
      sourceId: 'MERC_ABILITY_1',
      relation: 'lettuce_ability_summoned_minion',
      targetId: 'MERC_MINION_1',
    });
  });

  test('renderModel carries the summoned minion dbfId derived from the relation', () => {
    const result = runProjection(input);
    const en = result.localizations.find(l => l.lang === 'en');

    expect(en).toBeDefined();
    expect(en!.renderModel!.renderMechanics).toEqual({ '1676': 900002 });
    expect(result.entity.mechanics).toEqual({});
  });
});
