import { z } from 'zod';
import { classes, locale, race, rarity, spellSchool, types } from './basic';

import { card } from './card';

export const rune = z.enum(['blood', 'frost', 'unholy']);
export const questType = z.enum(['normal', 'questline', 'side']);
export const mercenaryRole = z.enum(['protector', 'fighter', 'caster', 'neutral']);
export const mercenaryFaction = z.enum(['alliance', 'empire', 'explorer', 'horde', 'legion', 'pirate', 'scourge']);
export const faction = z.enum(['alliance', 'horde', 'neutral']);

export const textBuilderType = z.enum([
    'default',
    'jade_golem',
    'jade_golem_trigger',
    'modular_entity',
    'kazakus_potion_effect',
    'primordial_wand',
    'alternate_card_text',
    'script_data_num_1',
    'galakrond_counter',
    'decorate',
    'player_tag_threshold',
    'entity_tag_threshold',
    'multiple_entity_names',
    'gameplay_string',
    'zombeast',
    'zombeast_enchantment',
    'hidden_choice',
    'investigate',
    'reference_creator_entity',
    'reference_script_data_num_1_entity',
    'reference_script_data_num_1_num_2_entity',
    'undatakah_enchant',
    'spell_damage_only',
    'drustvar_horror',
    'hidden_entity',
    'score_value_count_down',
    'script_data_num_1_num_2',
    'powered_up',
    'multiple_alt_text_script_data_nums',
    'reference_script_data_num_1_entity_power',
    'reference_script_data_num_1_card_dbid',
    'reference_script_data_num_card_race',
    'bg_quest',
    'multiple_alt_text_script_data_nums_ref_sdn6_card_dbid',
    'zilliax_deluxe_3000',
]);

export const changeType = z.enum([
    'unknown',
    'major',
    'minor',
    'non-functional',
    'wording',
    'bugged',
]);

export type Rune = z.infer<typeof rune>;
export type QuestType = z.infer<typeof questType>;
export type MercenaryRole = z.infer<typeof mercenaryRole>;
export type MercenaryFaction = z.infer<typeof mercenaryFaction>;
export type Faction = z.infer<typeof faction>;
export type TextBuilderType = z.infer<typeof textBuilderType>;
export type ChangeType = z.infer<typeof changeType>;

export const mechanicValue = z.union([z.boolean(), z.int()]);
export const mechanicMap = z.record(z.string(), mechanicValue);
export const referencedTagMap = z.record(z.string(), mechanicValue);
export const renderMechanic = z.enum([
    'tradable',
    'forge',
    'hide_cost',
    'hide_attack',
    'hide_health',
    'in_mini_set',
    'hide_watermark',
]);
export const renderMechanicMap = z.partialRecord(renderMechanic, mechanicValue);

export const renderModel = z.strictObject({
    cardId: z.string(),
    lang:   locale,

    variant:         z.string(),
    templateVersion: z.string(),
    assetVersion:    z.string(),

    localization: z.strictObject({
        name:     z.string(),
        richText: z.string(),
    }),

    type:              types,
    cost:              z.int(),
    attack:            z.int().nullable(),
    health:            z.int().nullable(),
    durability:        z.int().nullable(),
    armor:             z.int().nullable(),
    classes:           z.array(classes),
    race:              z.array(race).nullable(),
    spellSchool:       spellSchool.nullable(),
    mercenaryFaction:  mercenaryFaction.nullable(),
    set:               z.string(),
    overrideWatermark: z.string().nullable(),
    rarity:            rarity.nullable(),
    elite:             z.boolean(),
    techLevel:         z.int().nullable(),
    rune:              rune.array().nullable(),
    renderMechanics:   renderMechanicMap,
});

export const entityLocalization = z.strictObject({
    lang: locale,

    name:            z.string(),
    text:            z.string(),
    richText:        z.string(),
    displayText:     z.string(),
    targetText:      z.string().nullable(),
    textInPlay:      z.string().nullable(),
    howToEarn:       z.string().nullable(),
    howToEarnGolden: z.string().nullable(),
    flavorText:      z.string().nullable(),

    locChangeType: changeType.default('unknown'),
});

export const entity = z.strictObject({
    cardId:  z.string(),
    version: z.number().array().nonempty(),

    dbfId:         z.int(),
    legacyPayload: z.record(z.string(), z.unknown()),

    localization: entityLocalization.array(),

    set:             z.string(),
    classes:         z.array(classes),
    type:            types,
    cost:            z.int(),
    attack:          z.int().nullable(),
    health:          z.int().nullable(),
    durability:      z.int().nullable(),
    armor:           z.int().nullable(),
    rune:            rune.array().nullable(),
    race:            z.array(race).nullable(),
    spellSchool:     spellSchool.nullable(),
    questType:       questType.nullable(),
    questProgress:   z.int().nullable(),
    questPart:       z.int().nullable(),
    heroPower:       z.string().nullable(),

    techLevel:    z.int().nullable(),
    inBobsTavern: z.boolean(),
    tripleCard:   z.string().nullable(),
    raceBucket:   race.nullable(),
    armorBucket:  z.int().nullable(),
    buddy:        z.string().nullable(),
    bannedRace:   z.string().nullable(),

    mercenaryRole:    mercenaryRole.nullable(),
    mercenaryFaction: mercenaryFaction.nullable(),
    colddown:         z.int().nullable(),

    collectible: z.boolean(),
    elite:       z.boolean(),
    rarity:      rarity.nullable(),

    artist:            z.string(),
    overrideWatermark: z.string().nullable(),

    faction: faction.nullable(),

    mechanics:      mechanicMap,
    referencedTags: referencedTagMap,

    textBuilderType,

    changeType: changeType.default('unknown'),
    isLatest:   z.boolean(),
});

export const playRequirement = z.strictObject({
    type:  z.string(),
    param: z.int().optional(),
});

export const power = z.strictObject({
    definition:    z.string(),
    isMaster:      z.boolean().optional(),
    showInHistory: z.boolean().optional(),

    playRequirements: playRequirement.array().optional(),
});

export const entityView = entity.extend({
    lang:         locale,
    localization: entityLocalization.omit({ lang: true }),
});

export const cardEntityView = entityView.extend({
    revisionHash:     z.string(),
    localizationHash: z.string(),
    renderHash:       z.string().nullable(),

    legalities: card.shape.legalities,
});

export const cardFullView = cardEntityView.extend({
    versions: z.number().array().array(),

    relatedCards: z.strictObject({
        relation: z.string(),
        cardId:   z.string(),
        version:  z.number().array(),
    }).array(),
});

export type Entity = z.infer<typeof entity>;
export type EntityLocalization = z.infer<typeof entityLocalization>;
export type PlayRequirement = z.infer<typeof playRequirement>;
export type Power = z.infer<typeof power>;
export type EntityView = z.infer<typeof entityView>;
export type CardEntityView = z.infer<typeof cardEntityView>;
export type CardFullView = z.infer<typeof cardFullView>;
export type ReferencedTagMap = z.infer<typeof referencedTagMap>;
export type RenderMechanic = z.infer<typeof renderMechanic>;
export type RenderMechanicMap = z.infer<typeof renderMechanicMap>;
export type RenderModel = z.infer<typeof renderModel>;
