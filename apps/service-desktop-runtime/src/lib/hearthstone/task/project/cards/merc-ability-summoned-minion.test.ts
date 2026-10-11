import { describe, expect, test } from 'bun:test';

import { runProjection } from './runner';
import { mercAbilitySummonedMinionInput } from './merc-ability-summoned-minion.fixture';

describe('merc-ability-summoned-minion', () => {
  test('emits the summoned-minion relation from tag 1676', () => {
    const result = runProjection(mercAbilitySummonedMinionInput);

    expect(result.relations).toHaveLength(1);
    expect(result.relations[0]).toMatchObject({
      sourceId: 'MERC_ABILITY_1',
      relation: 'lettuce_ability_summoned_minion',
      targetId: 'MERC_MINION_1',
    });
  });

  test('renderModel carries the summoned minion dbfId derived from the relation', () => {
    const result = runProjection(mercAbilitySummonedMinionInput);
    const en = result.localizations.find(l => l.lang === 'en');

    expect(en).toBeDefined();
    expect(en!.renderModel!.renderMechanics).toEqual({ 1676: 900002 });
    expect(result.entity.mechanics).toEqual({});
  });
});
