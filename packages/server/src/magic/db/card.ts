import { Schema, Document } from 'mongoose';

import conn from './db';

export interface ICard {
    cardId: string,

    lang: string,
    setId: string,
    number: string,

    cmc: number,
    colorIdentity: string,

    parts: {
        cost?: string[],
        color?: string,
        colorIndicator?: string,

        typeSuper?: string[],
        typeMain: string[],
        typeSub?: string[]

        power?: string,
        toughness?: string,
        loyalty?: string,
        handModifier?: string,
        lifeModifier?: string,

        oracle: {
            name: string,
            text?: string,
            typeline: string,
        },

        unified: {
            name: string,
            text?: string,
            typeline: string,
        },

        printed: {
            name: string,
            text?: string,
            typeline: string,
        },

        scryfallIllusId?: string,
        flavorName?: string,
        flavorText?: string,
        artist?: string,
        watermark?: string
    }[],

    relatedCards: {
        relation: string,
        cardId: string,
        version?: {
            lang: string,
            set: string,
            number: string
        }
    }[],

    keywords: string[],
    producedMana?: string,

    layout: string,
    frame: string,
    frameEffects: string[],
    borderColor: string,
    cardBack: string,
    promoTypes?: string[],
    rarity: string,
    releaseDate: string,

    isDigital: boolean,
    isFullArt: boolean,
    isOversized: boolean,
    isPromo: boolean,
    isReprint: boolean,
    isStorySpotlight: boolean,
    isTextless: boolean,
    hasFoil: boolean,
    hasNonfoil: boolean,
    hasHighResImage: boolean,

    legalities: Record<string, string>,
    isReserved: boolean,
    inBooster: boolean,
    contentWarning?: boolean,
    games: string[],

    preview?: {
        date: string,
        source: string,
        uri: string,
    },

    scryfall: {
        cardId: string,
        oracleId: string,
        face?: 'front'|'back'
    },

    arenaId?: number,
    mtgoId?: number,
    mtgoFoilId?: number,
    multiverseId?: number[],
    tcgPlayerId?: number,
    cardMarketId?: number,

    __tags: {
        oracleUpdated: boolean
    }
}

const CardSchema = new Schema({
    cardId: String,

    lang:   String,
    setId:  String,
    number: String,

    cmc:           Number,
    colorIdentity: String,

    parts: [{
        _id: false,

        cost:           { type: [String], default: undefined },
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

        scryfallIllusId: String,
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

    keywords:     [String],
    producedMana: { type: [String], default: undefined },

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
    hasFoil:          Boolean,
    hasNonfoil:       Boolean,
    hasHighResImage:  Boolean,

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
        cardId:   String,
        oracleId: String,
        face:     String,
    },

    arenaId:      Number,
    mtgoId:       Number,
    mtgoFoilId:   Number,
    multiverseId: { type: [Number], default: undefined },
    tcgPlayerId:  Number,
    cardMarketId: Number,

    __tags: {
        updated: Boolean,
    },
});

const Card = conn.model<ICard & Document>('card', CardSchema);

export default Card;
