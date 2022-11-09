import { Schema } from 'mongoose';

import conn from './db';

import { Set as ISet } from '@interface/hearthstone/set';

const SetSchema = new Schema<ISet>({
    setId: String,
    dbfId: Number,
    slug:  String,

    localization: [{ _id: false, lang: String, name: String }],

    setType:     String,
    releaseDate: String,
    cardCount:   [Number],

    group: String,
});

const Set = conn.model<ISet>('set', SetSchema);

export default Set;
