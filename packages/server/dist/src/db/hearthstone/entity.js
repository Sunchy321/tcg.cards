"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const db_1 = __importDefault(require("./db"));
const EntitySchema = new mongoose_1.Schema({
    version: String,
    cardId: String,
    dbfId: Number,
    setId: String,
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
    isQuest: {},
    questProgress: Number,
    questReward: String,
    thresholdValue: Number,
    mechanics: [String],
    referencedTags: [String],
    powers: [
        {
            _id: false,
            definition: String,
            playRequirements: {
                type: [
                    {
                        _id: false,
                        reqType: String,
                        param: Number,
                    },
                ],
            },
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
const Entity = db_1.default.model('entity', EntitySchema);
exports.default = Entity;
//# sourceMappingURL=entity.js.map