import { Model, Schema } from 'mongoose';

import conn from './db';

import { Set as ISet } from '@interface/hearthstone/set';

// eslint-disable-next-line @typescript-eslint/ban-types
const SetSchema = new Schema<ISet, Model<ISet>, {}, {}, {}, {}, '$type'>({
    setId: String,
    dbfId: Number,
    slug:  String,

    localization: [{ _id: false, lang: String, name: String }],

    type:        String,
    releaseDate: String,
    cardCount:   [Number],

    group: String,
}, {
    typeKey: '$type',
});

const Set = conn.model<ISet>('set', SetSchema);

export default Set;
