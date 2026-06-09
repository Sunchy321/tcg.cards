/**
 * Detailed test to capture validation errors
 */

import { z } from 'zod';

// Import the schemas to test them directly
const cardEntityView = z.strictObject({
  cardId: z.string(),
  version: z.number().array(),
  lang: z.enum(['en', 'zhs']),
  revisionHash: z.string(),
  localizationHash: z.string(),
  renderHash: z.string().nullable(),
  
  set: z.string(),
  classes: z.array(z.enum(['druid', 'hunter', 'mage', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior', 'demon_hunter', 'death_knight'])),
  type: z.enum(['minion', 'spell', 'weapon', 'location', 'hero']),
  cost: z.number().int(),
  attack: z.number().int().nullable(),
  health: z.number().int().nullable(),
  durability: z.number().int().nullable(),
  armor: z.number().int().nullable(),
  rune: z.array(z.enum(['blood', 'frost', 'unholy'])).nullable(),
  race: z.array(z.enum(['beast', 'demon', 'dragon', 'elemental', 'mechanical', 'murloc', 'naga', 'pirate', 'quillboar', 'totem', 'undead'])).nullable(),
  spellSchool: z.enum(['arcane', 'fire', 'frost', 'nature', 'shadow', 'holy']).nullable(),
  questType: z.enum(['normal', 'questline', 'side']).nullable(),
  questProgress: z.number().int().nullable(),
  questPart: z.number().int().nullable(),
  heroPower: z.string().nullable(),
  
  techLevel: z.number().int().nullable(),
  inBobsTavern: z.boolean(),
  tripleCard: z.string().nullable(),
  raceBucket: z.enum(['beast', 'demon', 'dragon', 'elemental', 'mechanical', 'murloc', 'naga', 'pirate', 'quillboar', 'totem', 'undead']).nullable(),
  armorBucket: z.number().int().nullable(),
  buddy: z.string().nullable(),
  bannedRace: z.string().nullable(),
  
  mercenaryRole: z.enum(['protector', 'fighter', 'caster', 'neutral']).nullable(),
  mercenaryFaction: z.enum(['alliance', 'empire', 'explorer', 'horde', 'legion', 'pirate', 'scourge']).nullable(),
  colddown: z.number().int().nullable(),
  
  collectible: z.boolean(),
  elite: z.boolean(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).nullable(),
  
  artist: z.string(),
  overrideWatermark: z.string().nullable(),
  
  faction: z.enum(['alliance', 'horde', 'neutral']).nullable(),
  
  mechanics: z.record(z.string(), z.unknown()),
  referencedTags: z.record(z.string(), z.unknown()),
  
  textBuilderType: z.enum(['default']),
  
  changeType: z.enum(['unknown']).default('unknown'),
  isLatest: z.boolean(),
  
  dbfId: z.number().int(),
  legacyPayload: z.record(z.string(), z.unknown()),
  
  localization: z.strictObject({
    name: z.string(),
    text: z.string(),
    richText: z.string(),
    displayText: z.string(),
    targetText: z.string().nullable(),
    textInPlay: z.string().nullable(),
    howToEarn: z.string().nullable(),
    howToEarnGolden: z.string().nullable(),
    flavorText: z.string().nullable(),
    locChangeType: z.enum(['unknown']).default('unknown'),
  }),
  
  legalities: z.record(z.string(), z.enum(['derived', 'legal', 'minor', 'rotated', 'wild'])),
});

const normalResult = z.strictObject({
  result: z.array(cardEntityView),
  total: z.number().int().min(0),
  totalPage: z.number().int().min(0),
  page: z.number().int().min(0),
  elapsed: z.number().int().min(0),
});

const searchResult = z.strictObject({
  text: z.string().min(1).max(1000).optional(),
  result: normalResult.optional(),
  errors: z.array(z.any()).optional(),
});

// Test with sample data
const sampleData = {
  result: {
    result: [{
      cardId: 'EX1_279',
      version: [1, 2],
      lang: 'en',
      revisionHash: 'abc123',
      localizationHash: 'def456',
      renderHash: null,
      
      set: 'expert1',
      classes: ['mage'],
      type: 'spell',
      cost: 4,
      attack: null,
      health: null,
      durability: null,
      armor: null,
      rune: null,
      race: null,
      spellSchool: 'fire',
      questType: null,
      questProgress: null,
      questPart: null,
      heroPower: null,
      
      techLevel: null,
      inBobsTavern: false,
      tripleCard: null,
      raceBucket: null,
      armorBucket: null,
      buddy: null,
      bannedRace: null,
      
      mercenaryRole: null,
      mercenaryFaction: null,
      colddown: null,
      
      collectible: true,
      elite: false,
      rarity: 'free',
      
      artist: 'Test Artist',
      overrideWatermark: null,
      
      faction: null,
      
      mechanics: {},
      referencedTags: {},
      
      textBuilderType: 'default',
      
      changeType: 'unknown',
      isLatest: true,
      
      dbfId: 123,
      legacyPayload: {},
      
      localization: {
        name: 'Fireball',
        text: 'Deal 6 damage.',
        richText: 'Deal 6 damage.',
        displayText: 'Deal 6 damage.',
        targetText: null,
        textInPlay: null,
        howToEarn: null,
        howToEarnGolden: null,
        flavorText: 'This spell is useful for burning things. If you\'re looking for spells that toast things, you\'re in the wrong place.',
        locChangeType: 'unknown',
      },
      
      legalities: {
        standard: 'legal',
        wild: 'legal',
      },
    }],
    total: 1,
    totalPage: 1,
    page: 1,
    elapsed: 100,
  },
};

console.log(' Testing schema validation with sample data...\n');

try {
  const validated = searchResult.parse(sampleData);
  console.log('✅ Schema validation passed!');
  console.log('Validated data:', JSON.stringify(validated, null, 2));
} catch (error: any) {
  console.log('❌ Schema validation failed!');
  console.log('Error:', error.message);
  if (error.issues) {
    console.log('\nValidation issues:');
    error.issues.forEach((issue: any, idx: number) => {
      console.log(`  ${idx + 1}. Path: ${issue.path?.join('.') || 'root'}`);
      console.log(`     Message: ${issue.message}`);
      console.log(`     Code: ${issue.code}`);
      console.log(`     Expected: ${issue.expected}`);
      console.log(`     Received: ${typeof issue.received} (${JSON.stringify(issue.received)})`);
      console.log('');
    });
  }
}
