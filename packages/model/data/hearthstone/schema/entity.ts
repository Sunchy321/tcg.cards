import { z } from 'zod';
import { classes, locale, race, rarity, spellSchool, types } from './basic';

export const rune = z.enum(['blood', 'frost', 'unholy']);
export const questType = z.enum(['normal', 'questline', 'side']);
export const mercenaryRole = z.enum(['protector', 'fighter', 'caster', 'neutral']);
export const mercenaryFaction = z.enum(['alliance', 'empire', 'explorer', 'horde', 'legion', 'pirate', 'scourge']);
export const faction = z.enum(['alliance', 'horde', 'neutral']);

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

export type ChangeType = z.infer<typeof changeType>;

export const entitySchema = z.strictObject({
    cardId:  z.string(),
    version: z.string(),

    dfbId: z.number(),
    slug:  z.string().nullable(),

    set:             z.string(),
    classes:         z.array(classes),
    type:            types,
    cost:            z.number(),
    attack:          z.number().nullable(),
    health:          z.number().nullable(),
    durability:      z.number().nullable(),
    armor:           z.number().nullable(),
    rune:            rune.array().nullable(),
    race:            z.array(race).nullable(),
    spellSchool:     spellSchool.nullable(),
    questType:       questType.nullable(),
    questProgress:   z.number().nullable(),
    questPart:       z.number().nullable(),
    heroPower:       z.string().nullable(),
    heroicHeroPower: z.string().nullable(),

    techLevel:    z.number().nullable(),
    inBobsTavern: z.boolean(),
    tripleCard:   z.string().nullable(),
    raceBucket:   race.nullable(),
    coin:         z.number().nullable(),
    armorBucket:  z.number().nullable(),
    buddy:        z.string().nullable(),
    bannedRace:   z.string().nullable(),

    mercenaryRole:    mercenaryRole.nullable(),
    mercenaryFaction: mercenaryFaction.nullable(),
    colddown:         z.number().nullable(),

    collectible: z.boolean(),
    elite:       z.boolean(),
    rarity:      rarity.nullable(),

    artist: z.string(),

    faction: faction.nullable(),

    mechanics:      z.array(z.string()),
    referencedTags: z.array(z.string()),
    entourages:     z.array(z.string()).nullable(),

    deckOrder:         z.number().nullable(),
    overrideWatermark: z.string().nullable(),
    deckSize:          z.number().nullable(),
    localizationNotes: z.string().nullable(),

    changeType: changeType.default('unknown'),
    isLatest:   z.boolean(),
});

export const entityLocalization = z.strictObject({
    cardId:  z.string(),
    version: z.string(),
    lang:    locale,

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

export const power = z.strictObject({
    cardId:  z.string(),
    version: z.string(),
    index:   z.number(),

    definition:    z.string(),
    isMaster:      z.boolean().optional(),
    showInHistory: z.boolean().optional(),

    playRequirements: z.strictObject({
        type:  z.string(),
        param: z.number(),
    }).array(),
});

export type Entity = z.infer<typeof entitySchema>;
export type EntityLocalization = z.infer<typeof entityLocalization>;
