import { Document, Schema } from 'mongoose';

import conn from './db';

import { Entity as IEntity } from '@interface/hearthstone/entity';

const EntitySchema = new Schema<IEntity>({
    versions: [Number],

    cardId: String,
    dbfId:  Number,
    slug:   String,

    localization: [{
        _id:             false,
        lang:            String,
        name:            String,
        text:            String,
        displayText:     String,
        rawText:         String,
        targetText:      String,
        howToEarn:       String,
        howToEarnGolden: String,
        flavor:          String,
        illusId:         String,
    }],

    set:         String,
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
    armorBucket:  Number,
    buddy:        String,
    bannedRace:   String,

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
    deckSize:          Number,
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;

            return ret;
        },
    },
});

const Entity = conn.model<Document & IEntity>('entity', EntitySchema);

export default Entity;
