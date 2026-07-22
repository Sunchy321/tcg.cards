import { describe, expect, test } from 'bun:test';

import { DISPLAY_TAG_ID } from './constant';
import { applyLanguageRules, getDisplayText, textFromDisplayText } from './display';

function context(locale: 'en' | 'zhs' = 'en') {
  return {
    cardId:          'TEST_001',
    dbfId:           1,
    locale,
    classes:         [] as string[],
    tags:            new Map<number, number>(),
    cardIdByDbfId:   new Map<number, string>(),
    nameByDbfId:     new Map<number, string>(),
    richTextByDbfId: new Map<number, string>(),
  };
}

describe('textFromDisplayText', () => {
  test('removes UberText markup and collapses whitespace', () => {
    expect(textFromDisplayText('<b>Deal</b>_[d]3\n damage.', 'en')).toBe('Deal 3 damage.');
    expect(textFromDisplayText('well-\nknown', 'en')).toBe('well-known');
  });

  test('removes explicit line breaks for non-space writing locales', () => {
    expect(textFromDisplayText('造成\n3点伤害', 'zhs')).toBe('造成3点伤害');
    expect(textFromDisplayText('Deal\n3 damage', 'en')).toBe('Deal 3 damage');
  });

  test('preserves UberText escaped angle brackets as visible text', () => {
    expect(textFromDisplayText('Use <_value_>.', 'en')).toBe('Use < value >.');
  });
});

describe('getDisplayText', () => {
  test('resolves fixed gameplay strings in the requested locale', () => {
    const displayContext = context('zhs');
    displayContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 1);
    displayContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2, 2);

    expect(getDisplayText(displayContext, '升级：@', 'galakrond_counter')).toBe('升级：被<b>祈求</b>一次后升级。');
    expect(getDisplayText(displayContext, '{0}创造了{1}。', 'drustvar_horror')).toBe('某张牌创造了某张牌。');
  });

  test('resolves dbfId references from the current build and locale', () => {
    const displayContext = context();
    displayContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 42);
    displayContext.cardIdByDbfId.set(42, 'CS2_029');
    displayContext.nameByDbfId.set(42, 'Fireball');

    expect(getDisplayText(displayContext, 'Discover {0}.', 'reference_script_data_num_1_card_dbid')).toBe('Discover Fireball.');
    displayContext.nameByDbfId.clear();
    expect(() => getDisplayText(displayContext, 'Discover {0}.', 'reference_script_data_num_1_card_dbid')).toThrow('missing referenced name');
  });

  test('runs static TextUtils transformation after the builder', () => {
    expect(getDisplayText(context(), '$a3 damage, $d2 armor, #2 healing, and 1000000 copies.', 'default')).toBe('3 damage, 2 armor, 2 healing, and ∞ copies.');
    expect(getDisplayText(context(), 'Keep $x, discard $#.', 'default')).toBe('Keep , discard .');
    expect(getDisplayText(context(), 'Give {0}/{1}.@Give {2}/{3}.', 'battlegrounds_tavern_spell')).toBe('Give 0/0.');
  });

  test('formats static dynamic keyword names in the requested locale', () => {
    expect(getDisplayText(context(), 'Gain {0} and {1}.', 'dynamic_keyword')).toBe('Gain  and .');
    const dynamicContext = context();
    dynamicContext.tags.set(DISPLAY_TAG_ID.DYNAMIC_KEYWORD1, 1211);
    dynamicContext.tags.set(DISPLAY_TAG_ID.DYNAMIC_KEYWORD2, DISPLAY_TAG_ID.TAUNT);
    expect(getDisplayText(dynamicContext, 'Gain {0} and {1}.', 'dynamic_keyword')).toBe('Gain Elusive and Taunt.');

    const chineseContext = context('zhs');
    chineseContext.tags.set(DISPLAY_TAG_ID.DYNAMIC_KEYWORD1, 1211);
    chineseContext.tags.set(DISPLAY_TAG_ID.DYNAMIC_KEYWORD2, DISPLAY_TAG_ID.TAUNT);
    expect(getDisplayText(chineseContext, '获得{0}和{1}。', 'dynamic_keyword')).toBe('获得扰魔和嘲讽。');
  });

  test('uses the EntityDef class or default name for Herald text', () => {
    const warriorContext = context();
    warriorContext.classes = ['warrior'];
    warriorContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 5);
    expect(getDisplayText(warriorContext, 'Summon {0} with {1}.', 'herald')).toBe('Summon Ragnaros with 5.');

    const neutralContext = context('zhs');
    neutralContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 5);
    expect(getDisplayText(neutralContext, '召唤{0}，获得{1}。', 'herald')).toBe('召唤你的巨型随从，获得5。');
  });

  test('uses the first static gameplay-string stage for collection text', () => {
    const spellstoneContext = context();
    spellstoneContext.cardId = 'LOOT_507';
    expect(getDisplayText(spellstoneContext, 'Upgrade: @', 'gameplay_string')).toBe('Upgrade: <i>(Cast 4 spells to upgrade.)</i>');

    const chineseContext = context('zhs');
    chineseContext.cardId = 'LOOT_507';
    expect(getDisplayText(chineseContext, '升级：@', 'gameplay_string')).toBe('升级：<i>（施放四个法术后升级。）</i>');
  });

  test('formats normal and Battlegrounds race names from static tags', () => {
    const displayContext = context();
    displayContext.tags.set(DISPLAY_TAG_ID.QUEST_PROGRESS_TOTAL, 1);
    displayContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 24);
    displayContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2, 20);
    expect(getDisplayText(displayContext, 'Summon @ {0} and {1}.', 'reference_script_data_num_card_race')).toBe('Summon 1 Dragon and Beast.');

    displayContext.tags.set(DISPLAY_TAG_ID.QUEST_PROGRESS_TOTAL, 2);
    expect(getDisplayText(displayContext, 'Summon @ {0}.', 'reference_script_data_num_card_race')).toBe('Summon 2 Dragons.');
  });

  test('uses the static class name and alternate section for class text', () => {
    const warriorContext = context();
    warriorContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 10);
    expect(getDisplayText(warriorContext, 'No class.@For {0}.', 'reference_script_data_num_1_class')).toBe('For Warrior.');

    const chineseContext = context('zhs');
    chineseContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 10);
    expect(getDisplayText(chineseContext, '无职业。@为{0}。', 'reference_script_data_num_1_class')).toBe('为战士。');

    warriorContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 999999);
    expect(() => getDisplayText(warriorContext, 'No class.@For {0}.', 'reference_script_data_num_1_class')).toThrow('missing class name');
  });

  test('keeps BG quest text on the inherited EntityDef path', () => {
    const questContext = context();
    questContext.tags.set(DISPLAY_TAG_ID.QUEST_PROGRESS_TOTAL, 8);
    questContext.tags.set(DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1, 24);
    expect(getDisplayText(questContext, 'Complete {0} quests.@Reward: {1}.', 'bg_quest')).toBe('Complete {0} quests.@Reward: {1}.');
  });

  test('uses the EntityDef score and hidden-choice tags from GAME_TAG', () => {
    const scoreContext = context();
    scoreContext.tags.set(DISPLAY_TAG_ID.SCORE_VALUE_1, 7);
    expect(getDisplayText(scoreContext, 'Remaining: @', 'score_value_count_down')).toBe('Remaining: 7');

    const choiceContext = context();
    choiceContext.tags.set(DISPLAY_TAG_ID.HIDDEN_CHOICE, 1);
    choiceContext.tags.set(DISPLAY_TAG_ID.HIDDEN_CHOICE_OVERRIDE, 2);
    expect(getDisplayText(choiceContext, 'First@Second@Third', 'hidden_choice')).toBe('Third');
  });

  test('formats static Battlegrounds Zilliax module keyword names', () => {
    const zilliaxContext = context();
    zilliaxContext.tags.set(DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID, 107909);
    zilliaxContext.tags.set(DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID2, 107910);
    zilliaxContext.tags.set(DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID3, 107909);
    expect(getDisplayText(zilliaxContext, 'Gain:\n@', 'battlegrounds_zilliax')).toBe('Gain:\nTaunt\nReborn');

    zilliaxContext.tags.set(DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID, 999999);
    expect(() => getDisplayText(zilliaxContext, 'Gain: @', 'battlegrounds_zilliax')).toThrow('missing Battlegrounds Zilliax module');
  });

  test('formats Zilliax Deluxe module text from EntityDef tags', () => {
    const zilliaxContext = context();
    zilliaxContext.tags.set(DISPLAY_TAG_ID.MODULAR_ENTITY_PART_1, 104948);
    zilliaxContext.tags.set(DISPLAY_TAG_ID.MODULAR_ENTITY_PART_2, 104951);
    expect(getDisplayText(zilliaxContext, 'Default.', 'zilliax_deluxe_3000')).toBe('<b>Elusive</b>, <b>Poisonous</b>, <b>Divine Shield</b>, <b>Taunt</b>, <b>Lifesteal</b>, <b>Rush</b>');

    zilliaxContext.tags.set(DISPLAY_TAG_ID.MODULAR_ENTITY_PART_2, 0);
    zilliaxContext.richTextByDbfId.set(104948, 'Single module.');
    expect(getDisplayText(zilliaxContext, 'Default.', 'zilliax_deluxe_3000')).toBe('Single module.');
  });

  test('fails when multiple EntityDef names require game-state entities', () => {
    const namesContext = context();
    expect(getDisplayText(namesContext, '{0} made this.', 'multiple_entity_names')).toBe('another card made this.');

    namesContext.tags.set(DISPLAY_TAG_ID.CARDTEXT_ENTITY_0, 42);
    expect(() => getDisplayText(namesContext, '{0} made this.', 'multiple_entity_names')).toThrow('runtime-only builder=multiple_entity_names');
  });

  test('fails explicitly for an unmapped dynamic keyword tag', () => {
    const dynamicContext = context();
    dynamicContext.tags.set(DISPLAY_TAG_ID.DYNAMIC_KEYWORD1, 999999);

    expect(() => getDisplayText(dynamicContext, 'Gain {0}.', 'dynamic_keyword')).toThrow('missing keyword tag');
  });

  test('applies Korean particle rules to Latin and numeric preceding characters', () => {
    expect(applyLanguageRules('3|1(은,는)')).toBe('3은');
    expect(applyLanguageRules('8|1(으로,로)')).toBe('8로');
  });
});
