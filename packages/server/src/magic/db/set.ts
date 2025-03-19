import { Model, Schema } from 'mongoose';

import conn from './db';

import { Set as ISet } from '@interface/magic/set';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const SetSchema = new Schema<ISet, Model<ISet>, {}, {}, {}, {}, '$type'>({
    setId: String,

    block:  String,
    parent: String,

    printedSize: Number,
    cardCount:   Number,
    langs:       Array,
    rarities:    Array,

    localization: [{
        _id:            false,
        lang:           String,
        name:           String,
        isOfficialName: Boolean,
        link:           String,
    }],

    type:          String,
    isDigital:     Boolean,
    isFoilOnly:    Boolean,
    isNonfoilOnly: Boolean,
    symbolStyle:   {
        $type:   [String],
        default: undefined,
    },
    doubleFacedIcon: { $type: [String], default: undefined },

    releaseDate: String,

    scryfall: {
        id:   String,
        code: String,
    },

    mtgoCode:    String,
    tcgplayerId: Number,

    boosters: [{
        _id: false,

        boosterId: String,

        packs: [{
            _id: false,

            contents: [{
                _id: false,

                type:  String,
                count: Number,
            }],

            weight: Number,
        }],

        totalWeight: Number,

        sheets: [{
            _id: false,

            typeId: String,

            cards: [{
                _id: false,

                cardId:  String,
                version: {
                    set:    String,
                    number: String,
                    lang:   String,
                },
                weight: Number,
            }],

            totalWeight: Number,

            allowDuplicates: Boolean,
            balanceColors:   Boolean,
            isFoil:          Boolean,
            isFixed:         Boolean,
        }],
    }],
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

const Set = conn.model<ISet>('set', SetSchema);

export default Set;
