import { Model, Schema } from 'mongoose';

import conn from './db';

import { Set as ISet } from '@interface/lorcana/set';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export const SetSchema = new Schema<ISet, Model<ISet>, {}, {}, {}, {}, '$type'>({
    setId: String,

    cardCount: Number,
    langs:     Array,
    rarities:  Array,

    localization: [{
        _id:            false,
        lang:           String,
        name:           String,
        isOfficialName: Boolean,
    }],

    type: String,

    releaseDate:    String,
    prereleaseDate: String,

    lorcanaJsonId: String,
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
