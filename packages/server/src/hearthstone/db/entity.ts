import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IPlayRequirement {
    type: string;
    param: number;
}

export interface IPower {
    definition: string;
    playRequirements: IPlayRequirement[];
}

export interface IEntity {
    version: string;

    cardId: string;
    dbfId: number;

    setId: string;

    name: { lang: string; value: string }[];
    text: { lang: string; value: string }[];
    targetingArrowText: { lang: string; value: string }[];

    classes: string[];
    cardType: string;
    cost: number;
    attack: number;
    health: number;
    durability: number;
    armor: number;
    race: string;

    techLevel: number;
    inBobsTavern: boolean;
    tripleCard: string;
    raceBucket: string;
    coin: number;

    collectible: boolean;
    elite: boolean;
    rarity: string;

    howToEarn: { lang: string; value: string }[];
    howToEarnGolden: { lang: string; value: string }[];

    flavor: { lang: string; value: string }[];
    artist: string;

    faction: string;

    mechanics: string[];
    referencedTags: string[];

    powers: IPower[];

    relatedEntities: { relation: string, cardId: string }[];

    entourages: string[];
    heroPower: string;
    heroicHeroPower: string;

    multipleClasses: number;
    deckOrder: number;
    overrideWatermark: string;
}

const EntitySchema = new Schema({
    version: String,

    cardId: String,
    dbfId:  Number,

    setId: String,

    name:               [{ _id: false, lang: String, value: String }],
    text:               [{ _id: false, lang: String, value: String }],
    targetingArrowText: [{ _id: false, lang: String, value: String }],

    classes:    [String],
    cardType:   String,
    cost:       Number,
    attack:     Number,
    health:     Number,
    durability: Number,
    armor:      Number,
    race:       String,

    techLevel:    Number,
    inBobsTavern: { type: Boolean, default: false },
    tripleCard:   String,
    raceBucket:   String,
    coin:         Number,

    collectible: { type: Boolean, default: false },
    elite:       { type: Boolean, default: false },
    rarity:      String,

    howToEarn:       [{ _id: false, lang: String, value: String }],
    howToEarnGolden: [{ _id: false, lang: String, value: String }],

    flavor: [{ _id: false, lang: String, value: String }],
    artist: String,

    faction: String,

    mechanics:      [String],
    referencedTags: [String],

    powers: [{
        _id:              false,
        definition:       String,
        playRequirements: {
            type: [
                {
                    _id:     false,
                    reqType: String,
                    param:   Number,
                },
            ],
        },
    }],

    relatedEntities: [{
        _id:      false,
        relation: String,
        cardId:   String,
    }],

    entourages:      { type: [String], default: undefined },
    heroPower:       String,
    heroicHeroPower: String,

    multipleClasses:   Number,
    deckOrder:         Number,
    overrideWatermark: String,
});

const Entity = conn.model<IEntity & Document>('entity', EntitySchema);

export default Entity;
