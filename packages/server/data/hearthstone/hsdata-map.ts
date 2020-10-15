import { IEntityData } from '@/db/hearthstone/entity';

export interface ITag {
    /**
     * name of field assigned
     */
    index: keyof IEntityData;
    /**
     * true if the field is a boolean value
     */
    bool?: true;
    /**
     * true if the field is an array
     */
    array?: true;
    /**
     * non-null if use enum string instead of number;
     * true if the enum name is same as index
     */
    enum?: true | string;
}

export const tags: Record<string, ITag> = {
    45:   { index: 'health' },
    47:   { index: 'attack' },
    48:   { index: 'cost' },
    114:  { index: 'elite', bool: true },
    183:  { index: 'setId', enum: true },
    184:  { index: 'text' },
    185:  { index: 'name' },
    187:  { index: 'durability' },
    199:  { index: 'classes', array: true, enum: true },
    200:  { index: 'race', enum: true },
    201:  { index: 'faction', enum: true },
    202:  { index: 'cardType', enum: true },
    203:  { index: 'rarity', enum: true },
    292:  { index: 'armor' },
    321:  { index: 'collectible', bool: true },
    325:  { index: 'targetingArrowText' },
    342:  { index: 'artist' },
    351:  { index: 'flavor' },
    364:  { index: 'howToEarn' },
    365:  { index: 'howToEarnGolden' },
    380:  { index: 'heroPower' },
    451:  { index: 'scoreValue1' },
    453:  { index: 'scoreValue2' },
    476:  { index: 'multipleClasses' },
    480:  { index: 'classes', enum: 'multiClass' },
    982:  { index: 'puzzleType', enum: true },
    1132: { index: 'mouseOverCard' },
    1429: { index: 'tripleCard' },
    1440: { index: 'techLevel' },
    1452: { index: 'relatedCardInCollection' },
    1456: { index: 'inBobsTavern', bool: true },
    1587: { index: 'coin' },
    1086: { index: 'upgradedPower' },
    1186: { index: 'twinspellCopy' },
    1413: { index: 'countAsCopyOf' },
    1125: { index: 'deckOrder' },
    535:  { index: 'questProgress' },
    1089: { index: 'questReward' },
    1116: { index: 'thresholdValue' },
    1517: { index: 'overrideWatermark', enum: 'set' },
    1282: { index: 'heroicHeroPower' },
    1396: { index: 'swapTo' },
};

export const sets: Record<string, string> = {
    2:    'BASIC', // Basic
    3:    'CLS', // Classic
    4:    'HOF', // Hall of Fame
    12:   'NAXX', // Curse of Naxxramas
    13:   'GVG', // Goblins vs Gnomes
    14:   'BRM', // Blackrock mountain
    15:   'TGT', // The Grand Tournament
    20:   'LOE', // League of Explorers
    21:   'WOG', // Whispers of the Old Gods
    23:   'ONK', // "One Night in Karazhan
    25:   'MSG', // Mean Streets of Gadgetzan
    27:   'JUG', // Journey to Un'Goro
    1001: 'KFT', // Knights of the Frozen Throne
    1004: 'KNC', // Kobolds and Catacombs
    1125: 'TWW', // The Witchwood
    1127: 'TBP', // The Boomsday Project
    1129: 'RKR', // Rastakhan's Rumble
    1130: 'ROS', // Rise of Shadows
    1158: 'SOU', // Saviors of Uldum
    1347: 'DOD', // Descent of Dragons
    1403: 'GRA', // Galakrond's Awakening
    1414: 'AOO', // Ash of Outland
    1463: 'DHI', // Demon Hunter Initiate
    1443: 'SMA', // Scholomance Academy

    5:    'MISSION',
    16:   'CREDITS',
    17:   'SKIN', // Hero Skins
    18:   'TB', // Tavern Brawl, containing cards used in this mode
    1143: 'TOT', // Tavern of Time
    1439: 'WR', // Wild Returning
    1453: 'BGS', // Battlegrounds
};

export const classes: Record<string, string> = {
    1:  'death_knight',
    2:  'druid',
    3:  'hunter',
    4:  'mage',
    5:  'paladin',
    6:  'priest',
    7:  'rogue',
    8:  'shaman',
    9:  'warlock',
    10: 'warrior',
    11: 'dream',
    12: 'neutral',
    13: 'whizbang',
    14: 'demon_hunter',
};

export const multiClasses: Record<string, string[]> = {
    1:  ['hunter', 'paladin', 'warrior'],
    2:  ['druid', 'rogue', 'shaman'],
    3:  ['mage', 'priest', 'warlock'],
    4:  ['paladin', 'priest'],
    5:  ['priest', 'warlock'],
    6:  ['warlock', 'demon_hunter'],
    7:  ['demon_hunter', 'hunter'],
    8:  ['hunter', 'druid'],
    9:  ['druid', 'shaman'],
    10: ['shaman', 'mage'],
    11: ['mage', 'rogue'],
    12: ['rogue', 'warrior'],
    13: ['warrior', 'paladin'],
};

export const types: Record<string, string> = {
    1:  'game',
    2:  'player',
    3:  'hero',
    4:  'minion',
    5:  'spell',
    6:  'enchantment',
    7:  'weapon',
    8:  'item',
    9:  'token',
    11: 'blank',
    12: 'game_mode_button',
    10: 'hero_power',
    22: 'move_minion_hover_target',
};

export const races: Record<string, string> = {
    1:  'bloodelf',
    2:  'draenei',
    3:  'dwarf',
    4:  'gnome',
    5:  'goblin',
    6:  'human',
    7:  'nightelf',
    8:  'orc',
    9:  'tauren',
    10: 'troll',
    11: 'undead',
    12: 'worgen',
    13: 'goblin2',
    14: 'murloc',
    15: 'demon',
    16: 'scourge',
    17: 'mechanical',
    18: 'elemental',
    19: 'ogre',
    20: 'beast',
    21: 'totem',
    22: 'nerubian',
    23: 'pirate',
    24: 'dragon',
    25: 'blank',
    26: 'all',
    38: 'egg',
};

export const raceBuckets: Record<string, string> = {
    1591: 'dragon',
    1592: 'murloc',
    1593: 'demon',
    1594: 'beast',
    1595: 'mech',
    1596: 'pirate',
    1688: 'elemental',
};

export const mechanics: Record<string, string | null> = {
    2:    null, // temp variable 1, ignore
    3:    null, // temp variable 2, ignore
    12:   'premium',
    32:   'trigger_visual',
    189:  'windfury', // processed individually, includes mega_windfury
    190:  'taunt',
    191:  'stealth',
    192:  'spell_power', // processed individually
    194:  'divine_shield',
    197:  'charge',
    205:  'summoned', // only on Mind Controlling
    208:  'freeze',
    212:  'enrage',
    215:  'overload',
    217:  'deathrattle',
    218:  'battlecry',
    219:  'secret',
    220:  'combo',
    227:  'cant_attack',
    240:  'immune',
    247:  'cant_be_destroyed',
    251:  null, // attack_visual_type, ignore
    268:  null, // DevState, ignore
    293:  'morph',
    309:  '?maybe_immune',
    311:  'cant_be_targeted_by_spells',
    314:  'cant_be_silenced',
    330:  null, // enchantment_birth_visual, ignore
    331:  null, // enchantment_idle_visual, ignore
    332:  'cant_be_targeted_by_hero_powers',
    335:  'invisible_deathrattle',
    338:  'one_turn_effect',
    339:  'silence',
    349:  'immune_to_spell_power',
    350:  'adjacent_buff',
    362:  'aura',
    363:  'poisonous',
    367:  'ai_must_play',
    370:  'affected_by_spell_power',
    375:  'fantastic_treasure',
    377:  'topdeck',
    388:  'spare_part',
    389:  'forgetful',
    396:  'hero_power_damage',
    401:  'evil_glow',
    402:  'hide_stats',
    403:  'inspire',
    404:  'double_spell_damage',
    415:  'discover',
    424:  'ritual',
    426:  'functionally_dead',
    441:  'jade_golem', // it should be a referenced tag
    443:  'choose_one',
    448:  'untouchable',
    456:  'cant_be_fatigued',
    457:  'auto_attack',
    462:  'quest', // use isQuest instead of mechanics
    463:  '?boss_king_krush', // only on boss King Krush
    470:  'finish_attack_spell_on_damage',
    482:  null, // grimy_goons, ignored because useless
    483:  null, // jade_lotus, ignored because useless
    484:  null, // kabal, ignored because useless
    542:  'special_deathrattle',
    554:  '?corpse_raiser', // only on Corpse Raiser
    556:  '?boss_anomalous_rex', // only on boss Anomalous Rex
    676:  null, // some cards related to galakrond and some quests
    682:  'hide_health',
    683:  'hide_attack', // only on Unleash the Beast
    684:  'hide_cost',
    685:  'lifesteal',
    717:  '?unknown_717', // only on Level Up! and Ixlid, Fungal Lord
    758:  '?unknown_758', // only on two 5/5 buffs
    759:  '?unknown_759', // only on 3 cards
    782:  'base_galakrond',
    783:  'dungeon_passive_buff',
    785:  'ghostly', // destroy if it is in your hand at end of turn
    791:  'rush',
    793:  null, // hero deck id, ignore
    818:  'secret_deathrattle',
    839:  '?some_quest',
    843:  '?unknown_843',
    846:  'echo',
    849:  'modular',
    851:  'kingsbane_1', // only on kingsbane
    853:  '?replicating_menace', // only on Replicating Menace
    857:  'ignore_hide_stats_for_big_card',
    858:  '?unknown_858', // unknown mechanic, [hero power of skin].858 = [hero power of basic hero]
    886:  '?unknown_886', // only on 3 cards
    890:  'discard_cards',
    917:  'city_of_stormwind_1', // only on City of Stormwind
    920:  'city_of_stormwind_2', // only on City of Stormwind
    923:  'overkill',
    956:  'filter_even_in_collection',
    957:  'filter_odd_in_collection',
    960:  '?unknown_960', // only on 5 cards
    968:  'start_of_game',
    974:  'opponent_turn_deathrattle',
    976:  'enchantment_invisible',
    979:  'puzzle',
    994:  'lackey',
    997:  'special_deck',
    998:  'shudderwork',
    1023: 'kingsbane_2', // only on kingsbane
    1052: 'gears', // maybe related to Dr. Boom
    1057: 'shrine',
    1059: 'copy_spell_on_itself',
    1076: 'random_deck',
    1085: 'reborn',
    1090: 'dormant_visual',
    1099: null, // player shrine base deck id, ignore
    1107: 'hide_watermark',
    1114: 'non_keyword_echo',
    1115: null, // threshold tag id, ignore
    1118: 'affected_by_healing_does_damage',
    1135: null, // enchantment_banner_text, ignored
    1137: 'function_watcher',
    1142: null, // mouse_over_card_appearance, ignored
    1175: 'rastakhan_treasure',
    1176: '?unknown_1176', // only on Shirvallah's Vengeance
    1179: '?unknown_1179', // some adventure card
    1192: 'sidequest', // use isQuest instead of mechanics
    1193: 'twinspell',
    1199: '?unknown_1199',
    1200: '?helper_1200',
    1201: '?unknown_1201',
    1202: '?unknown_1202',
    1203: '?unknown_1203',
    1204: '?unknown_1204',
    1205: '?unknown_1205',
    1206: '?unknown_1206',
    1211: '?evasive_wyrm', // only on Evasive Wyrm
    1249: null, // shrine unknown tag, ignore
    1263: 'invoke',
    1270: '?freeze',
    1279: '?unknown_1279',
    1294: 'buff_health_up',
    1295: 'buff_cost_zero',
    1296: 'buff_cost_down',
    1297: 'buff_attack_up',
    1298: 'buff_cost_up',
    1333: 'outcast',
    1342: 'use_discover_visuals',
    1359: '?related_to_lackey',
    1365: 'galakrond_hero',
    1398: 'start_of_combat_1',
    1421: 'battlegrounds_minion_summoned',
    1423: 'battlegrounds_kel_thuzad',
    1427: 'spellburst',
    1437: 'battlegrounds_action',
    1438: 'game_button',
    1443: 'buff_durability_up',
    1450: 'consider_spell_power', // effects considering spell power that is not a damage
    1464: 'drag_minion', // drag_minion_to_buy & drag_minion_to_sell
    1471: null, // battlegrounds minion summoned?
    1475: null, // only on Replicating Menace and Annoy-o-Module, ignore
    1489: null, // source of buffs from Replicating Menace and Annoy-o-Module, useless
    1491: 'battlegrounds_hero',
    1500: '?red_whelp', // only on Red Whelp
    1506: 'start_of_combat_2', // only on 8 battlegrounds hero power
    1508: '?helper_1508',
    1530: '?zapp_slywick', // only on Zapp Slywick
    1531: 'start_of_combat_3',
    1543: 'mechanic_1543', // unknown mechanic
    1544: 'conditional_awake',
    1546: 'libram',
    1548: '?pack_tactics', // only on Pack Tactics
    1554: 'new_battlegrounds_hero',
    1557: 'start_of_combat_affect_right',
    1567: 'start_of_combat_affect_left', // only on 8 battlegrounds hero power
    1576: 'adjacent_battlecry',
    1584: 'cat',
    1590: 'generate_soul_fragment',
    1602: '?arcane_cannon', // only on Arcane Cannon
    1620: 'the_rat_king_skill',
    1649: null, // base hero of Aranna, Unleashed, ignore
    1650: 'studies',
    1652: 'start_dormant',
    1687: '?friendly_wager_1687', // only on Friendly Wager
    1692: '?friendly_wager_1692', // only on Friendly Wager
    1724: '?transfer_student_and_galakrond', // only on Transfer Student and Galakrond
    1745: '?secret_exit', // only on Secret Exit
};

export const puzzleTypes: Record<string, string> = {
    1: 'mirror',
    2: 'lethal',
    3: 'survive',
    4: 'board_clear',
};

export const referencedTags: Record<string, string> = {
    45:   'health',
    189:  'windfury',
    190:  'taunt',
    191:  'stealth',
    192:  'spell_power',
    194:  'divine_shield',
    197:  'charge',
    208:  'freeze',
    215:  'overload',
    217:  'deathrattle',
    218:  'battlecry',
    219:  'secret',
    220:  'combo',
    227:  'cant_attack',
    240:  'immune',
    260:  'frozen',
    292:  'armor',
    339:  'silence',
    340:  'counter',
    363:  'poisonous',
    367:  'ai_must_play',
    388:  'spare_part',
    415:  'discover',
    441:  'jade_golem',
    443:  'choose_one',
    457:  'auto_attack',
    462:  'quest',
    546:  'adapt',
    556:  'boss',
    685:  'lifesteal',
    763:  'recruit',
    791:  'rush',
    846:  'echo',
    849:  'modular',
    923:  'overkill',
    994:  'lackey',
    1057: 'shrine',
    1077: 'casts_when_drawn',
    1085: 'reborn',
    1207: 'mega_windfury',
    1263: 'empower',
    1290: 'fatigue',
    1333: 'outcast',
    1427: 'spellburst',
    1518: 'dormant',
    1531: 'start_of_combat',
};

export const playRequirements: Record<string, string> = {
    1:   'REQ_MINION_TARGET',
    2:   'REQ_FRIENDLY_TARGET',
    3:   'enemyTarget',
    4:   'REQ_DAMAGED_TARGET',
    5:   'REQ_ENCHANTED_TARGET',
    // 5: 'REQ_MAX_SECRETS',
    6:   'REQ_FROZEN_TARGET',
    7:   'REQ_CHARGE_TARGET',
    8:   'REQ_TARGET_MAX_ATTACK',
    9:   'REQ_NONSELF_TARGET',
    10:  'REQ_TARGET_WITH_RACE',
    11:  'REQ_TARGET_TO_PLAY',
    12:  'REQ_NUM_MINION_SLOTS',
    13:  'REQ_WEAPON_EQUIPPED',
    14:  'REQ_ENOUGH_MANA',
    15:  'REQ_YOUR_TURN',
    16:  'REQ_NONSTEALTH_ENEMY_TARGET',
    17:  'REQ_HERO_TARGET',
    18:  'REQ_SECRET_ZONE_CAP',
    19:  'REQ_MINION_CAP_IF_TARGET_AVAILABLE',
    20:  'REQ_MINION_CAP',
    21:  'REQ_TARGET_ATTACKED_THIS_TURN',
    22:  'REQ_TARGET_IF_AVAILABLE',
    23:  'REQ_MINIMUM_ENEMY_MINIONS',
    24:  'REQ_TARGET_FOR_COMBO',
    25:  'REQ_NOT_EXHAUSTED_ACTIVATE',
    26:  'REQ_UNIQUE_SECRET_OR_QUEST',
    27:  'REQ_TARGET_TAUNTER',
    28:  'REQ_CAN_BE_ATTACKED',
    29:  'REQ_ACTION_PWR_IS_MASTER_PWR',
    30:  'REQ_TARGET_MAGNET',
    31:  'REQ_ATTACK_GREATER_THAN_0',
    32:  'REQ_ATTACKER_NOT_FROZEN',
    33:  'REQ_HERO_OR_MINION_TARGET',
    34:  'REQ_CAN_BE_TARGETED_BY_SPELLS',
    35:  'REQ_SUBCARD_IS_PLAYABLE',
    36:  'REQ_TARGET_FOR_NO_COMBO',
    37:  'REQ_NOT_MINION_JUST_PLAYED',
    38:  'REQ_NOT_EXHAUSTED_HERO_POWER',
    39:  'REQ_CAN_BE_TARGETED_BY_OPPONENTS',
    40:  'REQ_ATTACKER_CAN_ATTACK',
    41:  'REQ_TARGET_MIN_ATTACK',
    42:  'REQ_CAN_BE_TARGETED_BY_HERO_POWERS',
    43:  'REQ_ENEMY_TARGET_NOT_IMMUNE',
    44:  'REQ_ENTIRE_ENTOURAGE_NOT_IN_PLAY',
    45:  'REQ_MINIMUM_TOTAL_MINIONS',
    46:  'REQ_MUST_TARGET_TAUNTER',
    47:  'REQ_UNDAMAGED_TARGET',
    48:  'REQ_CAN_BE_TARGETED_BY_BATTLECRIES',
    49:  'REQ_STEADY_SHOT',
    50:  'REQ_MINION_OR_ENEMY_HERO',
    51:  'REQ_TARGET_IF_AVAILABLE_AND_DRAGON_IN_HAND',
    52:  'REQ_LEGENDARY_TARGET',
    53:  'REQ_FRIENDLY_MINION_DIED_THIS_TURN',
    54:  'REQ_FRIENDLY_MINION_DIED_THIS_GAME',
    55:  'REQ_ENEMY_WEAPON_EQUIPPED',
    56:  'REQ_TARGET_IF_AVAILABLE_AND_MINIMUM_FRIENDLY_MINIONS',
    57:  'REQ_TARGET_WITH_BATTLECRY',
    58:  'REQ_TARGET_WITH_DEATHRATTLE',
    59:  'REQ_TARGET_IF_AVAILABLE_AND_MINIMUM_FRIENDLY_SECRETS',
    60:  'REQ_SECRET_ZONE_CAP_FOR_NON_SECRET',
    61:  'REQ_TARGET_EXACT_COST',
    62:  'REQ_STEALTHED_TARGET',
    63:  'REQ_MINION_SLOT_OR_MANA_CRYSTAL_SLOT',
    64:  'REQ_MAX_QUESTS',
    65:  'REQ_TARGET_IF_AVAILABLE_AND_ELEMENTAL_PLAYED_LAST_TURN',
    66:  'REQ_TARGET_NOT_VAMPIRE',
    67:  'REQ_TARGET_NOT_DAMAGEABLE_ONLY_BY_WEAPONS',
    68:  'REQ_NOT_DISABLED_HERO_POWER',
    69:  'REQ_MUST_PLAY_OTHER_CARD_FIRST',
    70:  'REQ_HAND_NOT_FULL',
    71:  'REQ_TARGET_IF_AVAILABLE_AND_NO_3_COST_CARD_IN_DECK',
    72:  'REQ_CAN_BE_TARGETED_BY_COMBOS',
    73:  'REQ_CANNOT_PLAY_THIS',
    74:  'REQ_FRIENDLY_MINIONS_OF_RACE_DIED_THIS_GAME',
    75:  'REQ_DRAG_TO_PLAY_PRE29933',
    77:  'REQ_OPPONENT_PLAYED_CARDS_THIS_GAME',
    78:  'REQ_LITERALLY_UNPLAYABLE',
    79:  'REQ_TARGET_IF_AVAILABLE_AND_HERO_HAS_ATTACK',
    80:  'REQ_FRIENDLY_MINION_OF_RACE_DIED_THIS_TURN',
    81:  'REQ_TARGET_IF_AVAILABLE_AND_MINIMUM_SPELLS_PLAYED_THIS_TURN',
    82:  'REQ_FRIENDLY_MINION_OF_RACE_IN_HAND',
    83:  'REQ_DRAG_TO_PLAY_PRE31761',
    86:  'REQ_FRIENDLY_DEATHRATTLE_MINION_DIED_THIS_GAME',
    89:  'REQ_FRIENDLY_REBORN_MINION_DIED_THIS_GAME',
    90:  'REQ_MINION_DIED_THIS_GAME',
    92:  'REQ_BOARD_NOT_COMPLETELY_FULL',
    93:  'REQ_TARGET_IF_AVAILABLE_AND_HAS_OVERLOADED_MANA',
    94:  'REQ_TARGET_IF_AVAILABLE_AND_HERO_ATTACKED_THIS_TURN',
    95:  'REQ_TARGET_IF_AVAILABLE_AND_DRAWN_THIS_TURN',
    96:  'REQ_TARGET_IF_AVAILABLE_AND_NOT_DRAWN_THIS_TURN',
    97:  'REQ_TARGET_NON_TRIPLED_MINION',
    98:  'REQ_BOUGHT_MINION_THIS_TURN',
    99:  'REQ_SOLD_MINION_THIS_TURN',
    100: 'REQ_TARGET_IF_AVAILABLE_AND_PLAYER_HEALTH_CHANGED_THIS_TURN',
    101: 'REQ_TARGET_IF_AVAILABLE_AND_SOUL_FRAGMENT_IN_DECK',
    102: 'REQ_DAMAGED_TARGET_UNLESS_COMBO',
    103: 'REQ_NOT_MINION_DORMANT',
    104: 'REQ_TARGET_NOT_DORMANT',
    105: 'REQ_TARGET_IF_AVAILABLE_AND_BOUGHT_RACE_THIS_TURN',
    106: 'REQ_TARGET_IF_AVAILABLE_AND_SOLD_RACE_THIS_TURN',
    999: 'REQ_DRAG_TO_PLAY',
};

export const rarities: Record<string, string> = {
    1: 'common',
    2: 'free',
    3: 'rare',
    4: 'epic',
    5: 'legendary',
};

export const factions: Record<string, string> = {
    1: 'horde',
    2: 'alliance',
    3: 'neutral',
};
