import { Document, Model, Schema } from 'mongoose';

import conn from './db';

import { Card as ICard } from '@interface/hearthstone/card';

// eslint-disable-next-line @typescript-eslint/ban-types
const CardSchema = new Schema<ICard, Model<ICard>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    version: [Number],
    change:  String,

    entityId: [String],

    localization: [{
        _id:             false,
        lang:            String,
        name:            String,
        text:            String,
        displayText:     String,
        targetText:      String,
        textInPlay:      String,
        howToEarn:       String,
        howToEarnGolden: String,
        flavor:          String,
        illusId:         String,
    }],

    set:         String,
    classes:     [String],
    type:        String,
    cost:        Number,
    attack:      Number,
    health:      Number,
    durability:  Number,
    armor:       Number,
    rune:        { $type: [String], default: undefined },
    race:        { $type: [String], default: undefined },
    spellSchool: String,
    quest:       { type: String, progress: Number, part: Number },

    techLevel:    Number,
    inBobsTavern: { $type: Boolean, default: false },
    tripleCard:   String,
    raceBucket:   String,
    coin:         Number,
    armorBucket:  Number,
    buddy:        String,
    bannedRace:   String,

    mercenaryRole:    String,
    mercenaryFaction: String,
    colddown:         Number,

    collectible: { $type: Boolean, default: false },
    elite:       { $type: Boolean, default: false },
    rarity:      String,

    artist: String,

    faction: String,

    mechanics:      [String],
    referencedTags: [String],

    relatedEntities: [{
        _id:      false,
        relation: String,
        cardId:   String,
    }],

    entourages:      { $type: [String], default: undefined },
    heroPower:       String,
    heroicHeroPower: String,

    deckOrder:         Number,
    overrideWatermark: String,
    deckSize:          Number,
    localizationNotes: String,
}, {
    typeKey: '$type',
    toJSON:  {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;

            return ret;
        },
    },
});

const Card = conn.model<Document & ICard>('card', CardSchema);

export default Card;
