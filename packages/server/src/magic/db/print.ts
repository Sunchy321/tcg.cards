import { Schema } from 'mongoose';

import conn from './db';

import { Print as IPrint } from '@interface/magic/print';
import { WithHistory } from '@/database/history';

const IPrintSchema = new Schema<WithHistory<IPrint>>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    parts: [{
        _id: false,

        name:     String,
        typeline: String,
        text:     String,

        attractionLights: { type: [Number], default: undefined },

        scryfallIllusId: { type: [String], default: undefined },
        flavorName:      String,
        flavorText:      String,
        artist:          String,
        watermark:       String,
    }],

    tags: [String],

    layout:        String,
    frame:         String,
    frameEffects:  [String],
    borderColor:   String,
    cardBack:      String,
    securityStamp: String,
    promoTypes:    { type: [String], default: undefined },
    rarity:        String,
    releaseDate:   String,

    isDigital:       Boolean,
    isPromo:         Boolean,
    isReprint:       Boolean,
    finishes:        [String],
    hasHighResImage: Boolean,
    imageStatus:     String,

    inBooster: Boolean,
    games:     [String],

    preview: {
        type: {
            _id:    false,
            date:   String,
            source: String,
            uri:    String,
        },
        default: undefined,
    },

    scryfall: {
        oracleId:  String,
        cardId:    String,
        face:      String,
        imageUris: Array,
    },

    arenaId:      Number,
    mtgoId:       Number,
    mtgoFoilId:   Number,
    multiverseId: { type: [Number], default: undefined },
    tcgPlayerId:  Number,
    cardMarketId: Number,

    __updations: [{
        _id:      false,
        source:   String,
        updation: Object,
    }],

    __lockedPaths: [String],
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            delete ret.__updations;
            delete ret.__lockedPaths;

            return ret;
        },
    },
});

const Print = conn.model('print', IPrintSchema);

export default Print;
