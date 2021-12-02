import { Document, Schema } from 'mongoose';

import conn from './db';

export interface ISet {
    setId: string;
    dbfId: number;
    slug?: string;

    localization: { lang: string, name: string }[];

    type: string;
    releaseDate?: string;
    cardCount: [number, number];

    group?: string;
    inStandard: boolean;
    inWild: boolean;
}

const SetSchema = new Schema<ISet>({
    setId: String,
    dbfId: Number,
    slug:  String,

    localization: [{ _id: false, lang: String, name: String }],

    type:        String,
    releaseDate: String,
    cardCount:   [Number],

    group:      String,
    inStandard: { type: Boolean, default: false },
    inWild:     { type: Boolean, default: false },
});

const Patch = conn.model<Document & ISet>('set', SetSchema);

export default Patch;
