import { Schema } from 'mongoose';

import conn from './db';

const HsdataEntitySchema = new Schema({
    version: String,

    cardId: String,
    dbfId: Number,

    set: String,

    name: [{ _id: false, lang: String, value: String }],
    text: [{ _id: false, lang: String, value: String }],
    targetingArrowText: [{ _id: false, lang: String, value: String }],

    classes: [String],
    cardType: String,
    cost: Number,
    attack: Number,
    health: Number,
    durability: Number,
    armor: Number,
    race: String,

    techLevel: Number,
    inBobsTavern: { type: Boolean, default: false },
    tripleCard: String,
    raceBucket: String,
    coin: Number,

    puzzleType: String,
    isQuest: {}, // true if is quest, 'side' if is also sidequest
    questProgress: Number,
    questReward: String,
    thresholdValue: Number,
    mechanics: [String],
    referencedTags: [String],

    powers: [
        {
            _id: false,
            definition: String,
            playRequirements: [
                {
                    _id: false,
                    reqType: String,
                    param: Number,
                },
            ],
        },
    ],

    entourages: { type: [String], default: undefined },
    heroPower: String,
    heroicHeroPower: String,
    relatedCardInCollection: String,
    twinspellCopy: String,
    upgradedPower: String,
    swapTo: String,

    scoreValue1: Number,
    scoreValue2: Number,
    multipleClasses: Number,
    mouseOverCard: String,
    countAsCopyOf: String,
    deckOrder: Number,
    overrideWatermark: String,

    collectible: { type: Boolean, default: false },
    elite: { type: Boolean, default: false },
    rarity: String,

    howToEarn: [{ _id: false, lang: String, value: String }],
    howToEarnGolden: [{ _id: false, lang: String, value: String }],

    flavor: [{ _id: false, lang: String, value: String }],
    artist: String,

    faction: String,
});

const HsdataEntity = conn.model('hsdataEntity', HsdataEntitySchema);

export default HsdataEntity;
