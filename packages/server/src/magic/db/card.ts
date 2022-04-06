import { Schema } from 'mongoose';

import conn from './db';

import { Card as ICardBase } from '@interface/magic/card';

export type ICard = Omit<ICardBase, 'parts'> & {
    parts: (ICardBase['parts'][0] & {
        __costMap?: Record<string, number>;
    })[];

    __tags: {
        oracleUpdated: boolean;
        printed?: boolean;
    };
};

const CardSchema = new Schema<ICard>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    manaValue:     Number,
    colorIdentity: String,

    parts: [{
        _id: false,

        cost:           { type: [String], default: undefined },
        __costMap:      Object,
        color:          String,
        colorIndicator: String,

        typeSuper: { type: [String], default: undefined },
        typeMain:  [String],
        typeSub:   { type: [String], default: undefined },

        power:        String,
        toughness:    String,
        loyalty:      String,
        handModifier: String,
        lifeModifier: String,

        oracle: {
            name:     String,
            text:     String,
            typeline: String,
        },

        unified: {
            name:     String,
            text:     String,
            typeline: String,
        },

        printed: {
            name:     String,
            text:     String,
            typeline: String,
        },

        scryfallIllusId: { type: [String], default: undefined },
        flavorName:      String,
        flavorText:      String,
        artist:          String,
        watermark:       String,
    }],

    relatedCards: [{
        _id:      false,
        relation: String,
        cardId:   String,
        version:  {
            type: {
                lang:   String,
                set:    String,
                number: String,
            },
            default: undefined,
        },
    }],

    rulings: [{
        _id:    false,
        source: String,
        date:   String,
        text:   String,
        cards:  [{ _id: false, id: String, text: String }],
    }],

    keywords:     [String],
    producedMana: { type: [String], default: undefined },

    category:     String,
    layout:       String,
    frame:        String,
    frameEffects: [String],
    borderColor:  String,
    cardBack:     String,
    promoTypes:   { type: [String], default: undefined },
    rarity:       String,
    releaseDate:  String,

    isDigital:        Boolean,
    isFullArt:        Boolean,
    isOversized:      Boolean,
    isPromo:          Boolean,
    isReprint:        Boolean,
    isStorySpotlight: Boolean,
    isTextless:       Boolean,
    finishes:         [String],
    hasHighResImage:  Boolean,
    imageStatus:      String,

    legalities:     Object,
    isReserved:     Boolean,
    inBooster:      Boolean,
    contentWarning: { type: Boolean, default: undefined },
    games:          [String],

    preview: {
        type: {
            date:   String,
            source: String,
            uri:    String,
        },
        default: undefined,
    },

    scryfall: {
        cardId:    String,
        oracleId:  String,
        face:      String,
        imageUris: Array,
    },

    arenaId:      Number,
    mtgoId:       Number,
    mtgoFoilId:   Number,
    multiverseId: { type: [Number], default: undefined },
    tcgPlayerId:  Number,
    cardMarketId: Number,

    __tags: {
        oracleUpdated: Boolean,
        printed:       Boolean,
    },
});

const Card = conn.model<ICard>('card', CardSchema);

export default Card;
