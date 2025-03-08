import { Model, Schema } from 'mongoose';

import conn from './db';

import { Entity as IEntity } from '@interface/hearthstone/entity';

// eslint-disable-next-line @typescript-eslint/ban-types
const EntitySchema = new Schema<IEntity, Model<IEntity>, {}, {}, {}, {}, '$type'>({
    version: [Number],

    entityId: String,
    cardId:   String,
    dbfId:    Number,
    slug:     String,

    localization: [{
        _id:             false,
        lang:            String,
        name:            String,
        text:            String,
        displayText:     String,
        rawText:         String,
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

    powers: {
        $type: [{
            _id:              false,
            definition:       String,
            isMaster:         Boolean,
            showInHistory:    Boolean,
            playRequirements: {
                $type: [
                    {
                        _id:     false,
                        reqType: String,
                        param:   Number,
                    },
                ],
                default: undefined,
            },
        }],
        default: undefined,
    },

    relatedEntities: [{
        _id:      false,
        relation: String,
        entityId: String,
    }],

    entourages:      { $type: [String], default: undefined },
    heroPower:       String,
    heroicHeroPower: String,

    deckOrder:         Number,
    overrideWatermark: String,
    deckSize:          Number,
    localizationNotes: String,

    isCurrent: Boolean,
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

const Entity = conn.model('entity', EntitySchema);

export default Entity;
