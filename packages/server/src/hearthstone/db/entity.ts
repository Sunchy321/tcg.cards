import { Document, Schema } from 'mongoose';

import conn from './db';

import { omit } from 'lodash';

export interface IPlayRequirement {
    type: string;
    param: number;
}

export interface IPower {
    definition: string;
    playRequirements: IPlayRequirement[];
}

export interface IEntity {
    version: number;

    cardId: string;
    dbfId: number;
    slug?: string;

    set: string;

    localization: {
        lang: string;
        name: string;
        text: string;
        rawText: string;
        targetText: string;
        howToEarn: string;
        howToEarnGolden: string;
        flavor: string;
    }[]

    classes: string[];
    cardType: string;
    cost: number;
    attack: number;
    health: number;
    durability: number;
    armor: number;
    race: string;
    spellSchool?: string;
    quest?: { type: 'normal' | 'side' | 'questline', progress: number, part?: number };

    techLevel: number;
    inBobsTavern: boolean;
    tripleCard: string;
    raceBucket: string;
    coin: number;

    mercenaryRole: string;
    colddown: number;

    collectible: boolean;
    elite: boolean;
    rarity: string;

    artist: string;

    faction: string;

    mechanics: string[];
    referencedTags: string[];

    powers: IPower[];

    relatedEntities: { relation: string, cardId: string }[];

    entourages: string[];
    heroPower: string;
    heroicHeroPower: string;
    parentCard?: string;
    childrenCard?: string[];

    multipleClasses: number;
    deckOrder: number;
    overrideWatermark: string;
}

const EntitySchema = new Schema({
    version: Number,

    cardId: String,
    dbfId:  Number,
    slug:   String,

    set: String,

    localization: [{
        _id:             false,
        lang:            String,
        name:            String,
        text:            String,
        rawText:         String,
        targetText:      String,
        howToEarn:       String,
        howToEarnGolden: String,
        flavor:          String,
    }],

    classes:     [String],
    cardType:    String,
    cost:        Number,
    attack:      Number,
    health:      Number,
    durability:  Number,
    armor:       Number,
    race:        String,
    spellSchool: String,
    quest:       { type: { type: String, progress: Number, part: Number } },

    techLevel:    Number,
    inBobsTavern: { type: Boolean, default: false },
    tripleCard:   String,
    raceBucket:   String,
    coin:         Number,

    mercenaryRole: String,
    colddown:      Number,

    collectible: { type: Boolean, default: false },
    elite:       { type: Boolean, default: false },
    rarity:      String,

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
    parentCard:      String,
    childrenCard:    { type: [String], default: undefined },

    multipleClasses:   Number,
    deckOrder:         Number,
    overrideWatermark: String,
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;

            ret.localization = Object.fromEntries(
                ret.localization.map((l: IEntity['localization'][0]) => [l.lang, omit(l, 'lang')]),
            );

            return ret;
        },
    },
});

const Entity = conn.model<IEntity & Document>('entity', EntitySchema);

export default Entity;
