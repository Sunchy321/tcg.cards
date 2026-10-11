import { describe, expect, test } from 'bun:test';

import { runProjection } from './cards/runner';
import { mercAbilitySummonedMinionInput } from './cards/merc-ability-summoned-minion.fixture';

import { deriveCardAmbits } from './ambit';
import type { AmbitEntityInput, AmbitRelationInput } from './ambit';

/** Fixture-style entity row: one card revision with the classification inputs. */
function entity(overrides: Partial<AmbitEntityInput> & { cardId: string }): AmbitEntityInput {
  return {
    type:            'minion',
    collectible:     false,
    inBobsTavern:    false,
    set:             '',
    mercenaryRole:   null,
    armor:           null,
    heroHasRuleText: false,
    ...overrides,
  };
}

function relation(relationName: string, sourceId: string, targetId: string): AmbitRelationInput {
  return { relation: relationName, sourceId, targetId };
}

describe('classifyCardAmbit (per-card, single-card projection)', () => {
  test('representative examples', () => {
    const ambits = deriveCardAmbits([
      entity({ cardId: 'COLLECTIBLE_SPELL', type: 'spell', collectible: true }),
      entity({ cardId: 'ENCHANTMENT', type: 'enchantment' }),
      entity({ cardId: 'MERC_ABILITY', type: 'mercenary_ability' }),
      entity({ cardId: 'MERC_MAIN', mercenaryRole: 'fighter' }),
      entity({ cardId: 'BG_STANDING', type: 'trinket', set: 'bgs' }),
      entity({ cardId: 'UI_HELPER', type: 'game_mode_button' }),
      entity({ cardId: 'BGS_HERO', type: 'hero', set: 'bgs' }),
      entity({ cardId: 'SKIN_HERO', type: 'hero', collectible: true }),
      entity({ cardId: 'REAL_HERO', type: 'hero', collectible: true, heroHasRuleText: true }),
      entity({ cardId: 'BGS_SPELL', type: 'spell', set: 'bgs' }),
    ], []);

    expect(ambits.get('COLLECTIBLE_SPELL')).toBe('primary');
    // Enchantments never leave full: attached buffs are not searchable content.
    expect(ambits.get('ENCHANTMENT')).toBe('full');
    expect(ambits.get('MERC_ABILITY')).toBe('additional');
    expect(ambits.get('MERC_MAIN')).toBe('primary');
    expect(ambits.get('BG_STANDING')).toBe('primary');
    expect(ambits.get('UI_HELPER')).toBe('full');
    expect(ambits.get('BGS_HERO')).toBe('primary');
    // Skin heroes are collectible but carry neither rule text nor armor.
    expect(ambits.get('SKIN_HERO')).toBe('full');
    expect(ambits.get('REAL_HERO')).toBe('primary');
    // BGS derivative spells are in-game spell content, not standing components.
    expect(ambits.get('BGS_SPELL')).toBe('additional');
  });
});

describe('deriveCardAmbits (pipeline-level derivation)', () => {
  test('relation evidence upgrades tokens to additional but never golden forms', () => {
    const ambits = deriveCardAmbits([
      entity({ cardId: 'POLYMORPH', type: 'spell', collectible: true }),
      entity({ cardId: 'SHEEP' }),
      entity({ cardId: 'GOLDEN_SHEEP' }),
      entity({ cardId: 'GOLDEN_MONKEY' }),
      entity({ cardId: 'GOLDEN_MONKEY_G' }),
    ], [
      relation('spellcraft', 'POLYMORPH', 'SHEEP'),
      relation('triple_card', 'SHEEP', 'GOLDEN_SHEEP'),
      relation('battlegrounds_tripled_base_minion', 'GOLDEN_MONKEY_G', 'GOLDEN_MONKEY'),
      relation('triple_card', 'GOLDEN_MONKEY', 'GOLDEN_MONKEY_G'),
      // Even real in-game evidence (an upgraded hero power naming the golden
      // form) must not lift a golden form out of full.
      relation('upgraded_hero_power', 'GOLDEN_MONKEY', 'GOLDEN_MONKEY_G'),
    ]);

    expect(ambits.get('SHEEP')).toBe('additional');
    expect(ambits.get('GOLDEN_SHEEP')).toBe('full');
    // Golden Monkey's base form is golden; its evidence comes from the
    // tripled-base edge of its own golden form, not from a triple_card.
    expect(ambits.get('GOLDEN_MONKEY')).toBe('additional');
    expect(ambits.get('GOLDEN_MONKEY_G')).toBe('full');
  });

  test('Aureate Laureate: the tavern form is primary, its golden form stays full', () => {
    const ambits = deriveCardAmbits([
      entity({ cardId: 'BG32_236', inBobsTavern: true }),
      entity({ cardId: 'BG32_236_G', inBobsTavern: false }),
    ], [
      relation('triple_card', 'BG32_236', 'BG32_236_G'),
      relation('battlegrounds_tripled_base_minion', 'BG32_236_G', 'BG32_236'),
    ]);

    expect(ambits.get('BG32_236')).toBe('primary');
    expect(ambits.get('BG32_236_G')).toBe('full');
  });

  test('hero powers ride their owner: real and bgs heroes additional, skin heroes and orphans full', () => {
    const ambits = deriveCardAmbits([
      entity({ cardId: 'REAL_HERO', type: 'hero', collectible: true, heroHasRuleText: true }),
      entity({ cardId: 'REAL_HERO_POWER', type: 'hero_power' }),
      entity({ cardId: 'BGS_HERO', type: 'hero', set: 'bgs' }),
      entity({ cardId: 'BGS_HERO_POWER', type: 'hero_power' }),
      entity({ cardId: 'SKIN_HERO', type: 'hero', collectible: true }),
      entity({ cardId: 'SKIN_HERO_POWER', type: 'hero_power' }),
      entity({ cardId: 'ORPHAN_POWER', type: 'hero_power' }),
    ], [
      relation('hero_power', 'REAL_HERO', 'REAL_HERO_POWER'),
      relation('hero_power', 'BGS_HERO', 'BGS_HERO_POWER'),
      relation('hero_power', 'SKIN_HERO', 'SKIN_HERO_POWER'),
    ]);

    expect(ambits.get('REAL_HERO_POWER')).toBe('additional');
    expect(ambits.get('BGS_HERO_POWER')).toBe('additional');
    expect(ambits.get('SKIN_HERO_POWER')).toBe('full');
    expect(ambits.get('ORPHAN_POWER')).toBe('full');
  });

  test('version-independent: ever-in-tavern and ever-collectible unify across revisions', () => {
    const ambits = deriveCardAmbits([
      entity({ cardId: 'RETIRED_MINION', inBobsTavern: true }),
      entity({ cardId: 'RETIRED_MINION', inBobsTavern: false }),
      entity({ cardId: 'EVER_COLLECTIBLE', type: 'minion', collectible: true }),
      entity({ cardId: 'EVER_COLLECTIBLE', type: 'minion', collectible: false }),
    ], []);

    expect(ambits.get('RETIRED_MINION')).toBe('primary');
    expect(ambits.get('EVER_COLLECTIBLE')).toBe('primary');
  });

  test('relation rows emitted by the merc-ability fixture act as ambit evidence', () => {
    // The mercenary-ability fixture projects one card and emits the
    // summoned-minion relation; the summoned minion itself is not projected
    // here. Feeding the fixture's relation rows into the derivation must lift
    // the summoned minion out of full — the pipeline-level guarantee.
    const result = runProjection(mercAbilitySummonedMinionInput);
    expect(result.relations).toHaveLength(1);

    const ambits = deriveCardAmbits([
      entity({ cardId: 'MERC_ABILITY_1', type: 'mercenary_ability' }),
      entity({ cardId: 'MERC_MINION_1' }),
    ], result.relations.map(r => ({
      relation: r.relation,
      sourceId: r.sourceId,
      targetId: r.targetId,
    })));

    expect(ambits.get('MERC_ABILITY_1')).toBe('additional');
    expect(ambits.get('MERC_MINION_1')).toBe('additional');
  });
});
