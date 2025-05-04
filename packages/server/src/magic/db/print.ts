/** AUTO GENERATED, DO NOT CHANGE **/
import { Model, Schema } from 'mongoose';

import conn from './db';

import { IPrintDatabase, toJSON } from '@common/model/magic/print';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
const PrintSchema = new Schema<IPrintDatabase, Model<IPrintDatabase>, {}, {}, {}, {}, '$type'>({
    cardId: String,

    lang:   String,
    set:    String,
    number: String,

    parts: [{
        _id: false,

        name:     String,
        typeline: String,
        text:     String,

        attractionLights: { $type: [Number], default: undefined },

        scryfallIllusId: { $type: [String], default: undefined },
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
    promoTypes:    { $type: [String], default: undefined },
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
        date:   String,
        source: String,
        uri:    String,
    },

    scryfall: {
        oracleId:  String,
        cardId:    String,
        face:      String,
        imageUris: [Object],
    },

    arenaId:      Number,
    mtgoId:       Number,
    mtgoFoilId:   Number,
    multiverseId: [Number],
    tcgPlayerId:  Number,
    cardMarketId: Number,

    __updations: [{
        _id: false,

        key:      String,
        oldValue: Object,
        newValue: Object,
    }],

    __lockedPaths: [String],
}, {
    typeKey: '$type',
    toJSON:  { transform: toJSON },
});

const Print = conn.model('print', PrintSchema);

export default Print;
