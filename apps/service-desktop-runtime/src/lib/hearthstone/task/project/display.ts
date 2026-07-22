import type { Locale } from '@tcg-cards/model/src/hearthstone/schema/basic';

import { DISPLAY_TAG_ID, keywordNameTags } from './constant';
import { classNames, gameplayBuilderStrings, gameplayStrings, heraldNames, keywordNames, raceNames, zilliaxCombinedModuleTexts } from './localization';

/** Static data available while projecting a collection card definition. */
export interface DisplayContext {
  cardId:          string;
  dbfId:           number;
  locale:          Locale;
  classes:         readonly string[];
  tags:            Map<number, number>;
  cardIdByDbfId:   ReadonlyMap<number, string>;
  nameByDbfId:     ReadonlyMap<number, string>;
  richTextByDbfId: ReadonlyMap<number, string>;
}

/** Resolves a maintained current GameStrings key for the requested locale. */
function gameString(context: DisplayContext, builderType: string, key: string): string {
  const value = gameplayStrings[context.locale]?.[key];
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing fixed string builder=${builderType} cardId=${context.cardId} locale=${context.locale} key=${key}`);
  }
  return value;
}

/** Resolves a static KEYWORD_TEXT tag to its maintained normal-mode name. */
function keywordName(context: DisplayContext, builderType: string, keywordTag: number): string {
  if (keywordTag === 0) return '';

  const index = keywordNameTags.get(keywordTag);
  if (index == null) {
    throw new Error(`[hearthstone][extracted-display] missing keyword tag builder=${builderType} cardId=${context.cardId} locale=${context.locale} tag=${keywordTag}`);
  }

  const value = keywordNames[context.locale][index];
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing keyword name builder=${builderType} cardId=${context.cardId} locale=${context.locale} tag=${keywordTag}`);
  }
  return value;
}

/** Selects the EntityDef Herald name or the game's static fallback. */
function heraldName(context: DisplayContext): string {
  const keyByClass: Readonly<Record<string, string>> = {
    warrior:      'GAMEPLAY_HERALD_WARRIOR',
    demon_hunter: 'GAMEPLAY_HERALD_DEMONHUNTER',
    shaman:       'GAMEPLAY_HERALD_SHAMAN',
    rogue:        'GAMEPLAY_HERALD_ROGUE',
    death_knight: 'GAMEPLAY_HERALD_DEATHKNIGHT',
    warlock:      'GAMEPLAY_HERALD_WARLOCK',
  };
  const key = context.classes.length === 1
    ? keyByClass[context.classes[0]!] ?? 'GAMEPLAY_HERALD_DEFAULT'
    : 'GAMEPLAY_HERALD_DEFAULT';
  const value = heraldNames[context.locale][key];
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing herald string builder=herald cardId=${context.cardId} locale=${context.locale} key=${key}`);
  }
  return value;
}

/** Resolves the fixed first-stage GameplayStringTextBuilder value for a card. */
function gameplayBuilderString(context: DisplayContext, builderType: string): string {
  const prefixes: readonly [string, string][] = [
    ['LOOT_507', 'GAMEPLAY_DIAMOND_SPELLSTONE_1'],
    ['LOOT_091', 'GAMEPLAY_PEARL_SPELLSTONE_1'],
    ['LOOT_064', 'GAMEPLAY_SAPPHIRE_SPELLSTONE_1'],
    ['LOOT_051', 'GAMEPLAY_JASPER_SPELLSTONE_1'],
    ['LOOT_043', 'GAMEPLAY_AMETHYST_SPELLSTONE_1'],
    ['LOOT_103', 'GAMEPLAY_RUBY_SPELLSTONE_1'],
    ['LOOT_503', 'GAMEPLAY_ONYX_SPELLSTONE_1'],
    ['LOOT_526d', 'GAMEPLAY_LOOT_526d_DARKNESS_1'],
    ['TOT_109t', 'GAMEPLAY_TOT_109t_STASIS_DRAGON_1'],
    ['TRLA_1', 'GAMEPLAY_TRLA_TROLL_SHRINE_1'],
  ];
  const key = prefixes.find(([cardId]) => context.cardId.includes(cardId))?.[1];
  if (key == null) {
    throw new Error(`[hearthstone][extracted-display] missing gameplay string builder=${builderType} cardId=${context.cardId} locale=${context.locale}`);
  }
  const value = gameplayBuilderStrings[context.locale][key];
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing fixed string builder=${builderType} cardId=${context.cardId} locale=${context.locale} key=${key}`);
  }
  return value;
}

/** Resolves a static race tag using the game's normal or Battlegrounds name table. */
function raceName(context: DisplayContext, builderType: string, raceTag: number, count: number): string {
  if (raceTag === 0) return '';
  const names = count > 1
    ? raceNames[context.locale].battlegrounds
    : raceNames[context.locale].normal;
  const value = names[raceTag];
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing race name builder=${builderType} cardId=${context.cardId} locale=${context.locale} tag=${raceTag}`);
  }
  return value;
}

/** Resolves the static TAG_CLASS value used by the collection card definition. */
function className(context: DisplayContext, builderType: string, classTag: number): string {
  if (classTag === 0) return '';
  const value = classNames[context.locale][classTag];
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing class name builder=${builderType} cardId=${context.cardId} locale=${context.locale} tag=${classTag}`);
  }
  return value;
}

const battlegroundsZilliaxKeywordTags = new Map<number, number>([
  [107909, DISPLAY_TAG_ID.TAUNT],
  [107910, DISPLAY_TAG_ID.REBORN],
  [107911, DISPLAY_TAG_ID.DIVINE_SHIELD],
  [108931, DISPLAY_TAG_ID.STEALTH],
  [109802, DISPLAY_TAG_ID.WINDFURY],
  [109811, DISPLAY_TAG_ID.MAGNETIC],
]);

/** Resolves the fixed Battlegrounds Zilliax module ids in EntityDef tag order. */
function battlegroundsZilliaxKeywords(context: DisplayContext, builderType: string): string {
  const moduleIds = [
    tag(context, DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID),
    tag(context, DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID2),
    tag(context, DISPLAY_TAG_ID.BACON_TRIPLED_BASE_MINION_ID3),
  ];
  const seen = new Set<number>();
  const names: string[] = [];

  for (const moduleId of moduleIds) {
    if (moduleId === 0 || seen.has(moduleId)) continue;
    seen.add(moduleId);
    const keywordTag = battlegroundsZilliaxKeywordTags.get(moduleId);
    if (keywordTag == null) {
      throw new Error(`[hearthstone][extracted-display] missing Battlegrounds Zilliax module builder=${builderType} cardId=${context.cardId} locale=${context.locale} dbfId=${moduleId}`);
    }
    names.push(keywordName(context, builderType, keywordTag));
  }

  return names.join('\n');
}

const zilliaxFunctionalModuleOrder = new Map<number, number>([
  [104944, 8], [104945, 4], [104946, 5], [104947, 3],
  [104948, 1], [104949, 7], [104950, 6], [104951, 2],
]);

/** Recreates the Zilliax Deluxe EntityDef branch from its two functional modules. */
function zilliaxDeluxeText(context: DisplayContext, builderType: string, rawText: string): string {
  const firstModule = tag(context, DISPLAY_TAG_ID.MODULAR_ENTITY_PART_1);
  const secondModule = tag(context, DISPLAY_TAG_ID.MODULAR_ENTITY_PART_2);
  const firstOrder = zilliaxFunctionalModuleOrder.get(firstModule);
  const secondOrder = zilliaxFunctionalModuleOrder.get(secondModule);

  if (firstOrder != null && secondOrder != null) {
    const key = `ZILLIAX_DELUXE_COMBINED_MODULE_${Math.min(firstOrder, secondOrder)}_${Math.max(firstOrder, secondOrder)}`;
    const value = zilliaxCombinedModuleTexts[context.locale][key];
    if (value == null) {
      throw new Error(`[hearthstone][extracted-display] missing Zilliax combined text builder=${builderType} cardId=${context.cardId} locale=${context.locale} key=${key}`);
    }
    return value;
  }

  const moduleId = firstOrder != null ? firstModule : secondOrder != null ? secondModule : 0;
  if (moduleId === 0) return rawText;
  const value = context.richTextByDbfId.get(moduleId);
  if (value == null) {
    throw new Error(`[hearthstone][extracted-display] missing Zilliax module text builder=${builderType} cardId=${context.cardId} locale=${context.locale} dbfId=${moduleId}`);
  }
  return value;
}

/** Formats numbered CardTextBuilder placeholders without leaving unresolved tokens. */
function format(context: DisplayContext, builderType: string, template: string, args: readonly string[]): string {
  return template.replace(/\{(\d+)\}/g, (match, indexText: string) => {
    const value = args[Number(indexText)];
    if (value == null) {
      throw new Error(`[hearthstone][extracted-display] missing format argument builder=${builderType} cardId=${context.cardId} locale=${context.locale} placeholder=${match}`);
    }
    return value;
  });
}

/** Resolves a referenced dbfId to its name in the projection's current locale. */
function cardName(context: DisplayContext, builderType: string, dbfId: number): string {
  if (dbfId === 0) return gameString(context, builderType, 'GAMEPLAY_UNKNOWN_CREATED_BY');
  if (!context.cardIdByDbfId.has(dbfId)) {
    throw new Error(`[hearthstone][extracted-display] missing referenced card builder=${builderType} cardId=${context.cardId} locale=${context.locale} dbfId=${dbfId}`);
  }
  const name = context.nameByDbfId.get(dbfId);
  if (name == null) {
    throw new Error(`[hearthstone][extracted-display] missing referenced name builder=${builderType} cardId=${context.cardId} locale=${context.locale} dbfId=${dbfId}`);
  }
  return name;
}

function atSection(text: string, index: number): string {
  let start = 0;
  for (let i = 0; i < index; i++) {
    const pos = text.indexOf('@', start);
    if (pos < 0) return i === 0 ? text : '';
    start = pos + 1;
  }
  const end = text.indexOf('@', start);
  return end >= 0 ? text.substring(start, end) : text.substring(start);
}

/** Selects an alternate section while matching EntityDef's clamped collection path. */
function alternateSection(text: string, index: number): string {
  const sections = text.split('@');
  return sections[Math.min(Math.max(index, 0), sections.length - 1)] ?? '';
}

function tag(context: DisplayContext, enumId: number): number {
  return context.tags.get(enumId) ?? 0;
}

function precedingKoreanCode(text: string): number {
  for (let index = text.length - 1; index >= 0; index--) {
    const code = text.charCodeAt(index);
    if (code >= 0xAC00 && code <= 0xD7A3) return code;
    if ((code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      return code === 76 || code === 108 || code === 82 || code === 114
        ? 51068
        : code === 77 || code === 109 || code === 78 || code === 110
          ? 50689
          : 51060;
    }
    if (code >= 48 && code <= 57) {
      return code === 48 || code === 51 || code === 54
        ? 50689
        : code === 49 || code === 55 || code === 56
          ? 51068
          : 51060;
    }
    if (!')}]:;?/*&^!~`/\\|_\'"'.includes(text[index]!)) return 51060;
  }
  return 51060;
}

function parseLanguageRule1(str: string): string {
  let result = str;
  let idx = result.indexOf('|1(');
  while (idx >= 0) {
    const preStr = result.substring(0, idx);
    const openIdx = idx + 2;
    const closeIdx = result.indexOf(')', openIdx);
    if (closeIdx < 0) break;

    const args = result.substring(openIdx + 1, closeIdx).split(',');
    if (args.length !== 2) break;

    const precedingChar = precedingKoreanCode(preStr);

    const batchim = (precedingChar - 0xAC00) % 28;
    const useArg2 = batchim === 0 || (batchim === 8 && args[1]![0] === '로');

    result = preStr + args[useArg2 ? 1 : 0]! + result.substring(closeIdx + 1);
    idx = result.indexOf('|1(');
  }
  return result;
}

function parseLanguageRule4(str: string): string {
  let result = str;
  let idx = result.indexOf('|4(');
  while (idx >= 0) {
    const preStr = result.substring(0, idx);
    const openIdx = idx + 2;
    const closeIdx = result.indexOf(')', openIdx);
    if (closeIdx < 0) break;

    const args = result.substring(openIdx + 1, closeIdx).split(',');
    if (args.length < 2) break;

    result = preStr + args[0]! + result.substring(closeIdx + 1);
    idx = result.indexOf('|4(');
  }
  return result;
}

export function applyLanguageRules(text: string): string {
  if (text.includes('|1(')) text = parseLanguageRule1(text);
  if (text.includes('|4(')) text = parseLanguageRule4(text);
  return text;
}

/** Applies TextUtils.TransformCardText with collection-only zero runtime bonuses. */
function transformCardText(text: string): string {
  const decoded = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  let transformed = '';

  for (let index = 0; index < decoded.length; index++) {
    const token = decoded[index]!;
    if (token !== '$' && token !== '#') {
      transformed += token;
      continue;
    }

    index++;
    if (decoded[index] === 'a' || decoded[index] === 'd') {
      index++;
    }
    const numberStart = index;
    while (index < decoded.length && /\d/.test(decoded[index]!)) index++;
    if (numberStart === index) continue;

    // Collection EntityDef text always invokes TextUtils without runtime bonuses.
    transformed += decoded.substring(numberStart, index);
    index--;
  }

  return transformed.replace(/\d{7,}/g, value => {
    const number = Number(value);
    return number >= 1_000_000 && number <= 2_147_483_647 ? '∞' : value;
  });
}

/** Fails rather than projecting an Entity-only display branch as collection text. */
function runtimeOnly(context: DisplayContext, builderType: string, detail: string): never {
  throw new Error(`[hearthstone][extracted-display] runtime-only builder=${builderType} cardId=${context.cardId} locale=${context.locale} ${detail}`);
}

function applyTextBuilder(context: DisplayContext, rawText: string, builderType: string): string {
  switch (builderType) {
  case 'modular_entity':
  case 'investigate':
    return '';

  case 'jade_golem':
  case 'jade_golem_trigger':
    return atSection(rawText, 1);

  case 'galakrond_counter': {
    const script2 = tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2);
    const script1 = tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1);
    return rawText.replace(/@/g, gameString(context, builderType, script2 - script1 === 1 ? 'GALAKROND_ONCE' : 'GALAKROND_TWICE'));
  }

  case 'score_value_count_down':
    return rawText.replace(/@/g, String(tag(context, DISPLAY_TAG_ID.SCORE_VALUE_1)));

  case 'script_data_num_1': {
    const delimiterIndices: number[] = [];
    for (let i = 0; i < rawText.length; i++) {
      if (rawText[i] === '@') delimiterIndices.push(i);
    }
    if (delimiterIndices.length === 2 && tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1) === 0) {
      return rawText.substring(0, delimiterIndices[0]!);
    }
    return rawText.replace(/@/g, String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)));
  }

  case 'script_data_num_1_num_2':
    return rawText
      .replace(/\{0\}/g, String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)))
      .replace(/\{1\}/g, String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2)));

  case 'drustvar_horror':
    return rawText
      .replace(/\{0\}/g, gameString(context, builderType, 'GAMEPLAY_UNKNOWN_CREATED_BY'))
      .replace(/\{1\}/g, gameString(context, builderType, 'GAMEPLAY_UNKNOWN_CREATED_BY'));

  case 'reference_script_data_num_1_entity':
    return rawText
      .replace(/@/g, String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2)))
      .replace(/\{0\}/g, gameString(context, builderType, 'GAMEPLAY_UNKNOWN_CREATED_BY'));

  case 'reference_script_data_num_1_card_dbid':
    return format(context, builderType, rawText, [cardName(context, builderType, tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1))]);

  case 'entity_tag_threshold':
  case 'player_tag_threshold':
  case 'primordial_wand':
  case 'reference_script_data_num_1_entity_power':
  case 'spell_absorb':
    return atSection(rawText, 0);

  case 'alternate_card_text':
  case 'alt_text_reference_script_data_num_1_num_2_entity_power':
    return atSection(rawText, tag(context, DISPLAY_TAG_ID.USE_ALTERNATE_CARD_TEXT));

  case 'hidden_choice': {
    const choice = tag(context, DISPLAY_TAG_ID.HIDDEN_CHOICE_OVERRIDE)
      || tag(context, DISPLAY_TAG_ID.HIDDEN_CHOICE);
    return atSection(rawText, choice);
  }

  case 'kazakus_potion_effect':
    return atSection(rawText, 0);

  case 'battlegrounds_tavern_spell':
    return format(context, builderType, alternateSection(rawText, 0), [
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)),
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2)),
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_3)),
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_4)),
    ]);

  case 'multiple_alt_text_script_data_nums':
    return format(context, builderType, alternateSection(rawText, tag(context, DISPLAY_TAG_ID.USE_ALTERNATE_CARD_TEXT)), [
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_3)),
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_4)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_5)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_6)),
    ]);

  case 'alternate_card_text_with_script_data':
    return format(context, builderType, alternateSection(rawText, tag(context, DISPLAY_TAG_ID.USE_ALTERNATE_CARD_TEXT)), [
      '', String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_3)),
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_4)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_5)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_6)),
    ]);

  case 'battlegrounds_deep_blues_spell':
    return format(context, builderType, rawText, [String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2))]);

  case 'dynamic_keyword':
    return format(context, builderType, rawText, [
      keywordName(context, builderType, tag(context, DISPLAY_TAG_ID.DYNAMIC_KEYWORD1)),
      keywordName(context, builderType, tag(context, DISPLAY_TAG_ID.DYNAMIC_KEYWORD2)),
    ]);

  case 'reference_script_data_num_card_race': {
    const count = tag(context, DISPLAY_TAG_ID.QUEST_PROGRESS_TOTAL);
    return format(context, builderType, count === 0 ? rawText : rawText.replace(/@/g, String(count)), [
      raceName(context, builderType, tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1), count),
      raceName(context, builderType, tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2), count),
    ]);
  }

  // The builder only formats quest progress for runtime Entity text; EntityDef uses default text.
  case 'bg_quest':
    return rawText;

  case 'reference_script_data_num_1_class':
    return format(context, builderType, atSection(rawText, tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1) === 0 ? 0 : 1), [
      className(context, builderType, tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)),
    ]);

  case 'multiple_alt_text_script_data_nums_ref_sdn6_card_dbid':
    return format(context, builderType, alternateSection(rawText, tag(context, DISPLAY_TAG_ID.USE_ALTERNATE_CARD_TEXT)), [
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_2)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_3)),
      String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_4)), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_5)), cardName(context, builderType, tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_6)),
    ]);

  case 'battlegrounds_zilliax':
    return rawText.replace(/@/g, battlegroundsZilliaxKeywords(context, builderType));

  case 'herald':
    return format(context, builderType, rawText, [heraldName(context), String(tag(context, DISPLAY_TAG_ID.TAG_SCRIPT_DATA_NUM_1))]);

  case 'gameplay_string':
    return rawText.replace('@', gameplayBuilderString(context, builderType));

  case 'zilliax_deluxe_3000':
    return zilliaxDeluxeText(context, builderType, rawText);

  case 'multiple_entity_names':
    for (let index = 0; index < 10; index++) {
      const entityTag = DISPLAY_TAG_ID.CARDTEXT_ENTITY_0 + index;
      if (tag(context, entityTag) !== 0) {
        return runtimeOnly(context, builderType, `entity reference tag=${entityTag}`);
      }
    }
    return format(context, builderType, rawText, Array.from({ length: 10 }, () => gameString(context, builderType, 'GAMEPLAY_UNKNOWN_CREATED_BY')));

  case 'default':
  case 'reference_creator_entity':
  case 'reference_script_data_num_1_num_2_entity':
  case 'undatakah_enchant':
  case 'zombeast_enchantment':
  case 'decorate':
  case 'hidden_entity':
  case 'spell_damage_only':
  case 'powered_up':
  case 'reference_script_data_num_1_num_2_entity_power':
  case 'rewind_mechanic_card_text_builder':
  case 'silver_hand_recruit':
    return rawText;

  case 'zombeast':
    return '';

  default:
    throw new Error(`[hearthstone][extracted-display] unknown textBuilderType: ${builderType}`);
  }
}

/** Builds the static formatted text that collection UI sends to UberText. */
export function getDisplayText(context: DisplayContext, richText: string, builderType: string): string {
  return applyLanguageRules(transformCardText(applyTextBuilder(context, richText, builderType)));
}

/** Identifies locales where card-layout line breaks must not become word spaces. */
function removesLineBreaks(locale: Locale): boolean {
  return locale === 'zhs' || locale === 'zht' || locale === 'ja' || locale === 'th';
}

/** Removes UberText markup and normalizes its visible whitespace characters. */
export function textFromDisplayText(displayText: string, locale: Locale): string {
  // Collection text must remain searchable when the source inserted CJK layout breaks.
  const source = removesLineBreaks(locale)
    ? displayText.replace(/[\r\n]/g, '')
    : displayText;
  let text = '';

  for (let index = 0; index < source.length; index++) {
    const char = source[index]!;

    if (char === '<') {
      if (source[index + 1] === '_') {
        text += '< ';
        index++;
        continue;
      }
      const end = source.indexOf('>', index + 1);
      if (end < 0) break;
      index = end;
      continue;
    }

    if (char === '_' && source[index + 1] === '>') {
      text += ' >';
      index++;
      continue;
    }

    if (char === '[' && source[index + 2] === ']' && /[bdx]/.test(source[index + 1] ?? '')) {
      index += 2;
      continue;
    }

    if (char === ' ' || char === '\t' || char === '\r' || char === '\n' || char === '_') {
      const joinsHyphenatedWord = char === '\n' && index > 0 && source[index - 1] === '-';
      while (index + 1 < source.length && /[ \t\r\n_]/.test(source[index + 1]!)) index++;
      if (!joinsHyphenatedWord) text += ' ';
      continue;
    }

    text += char;
  }

  return text.trim();
}
