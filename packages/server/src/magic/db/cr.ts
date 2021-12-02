import { Document, Schema } from 'mongoose';

import conn from './db';

import { CR as ICR } from '@interface/magic/cr';

const CRMenuSchema = new Schema<ICR>({
    date:     String,
    intro:    String,
    contents: [{
        _id:      false,
        id:       String,
        index:    String,
        depth:    Number,
        text:     String,
        examples: { type: [String], default: undefined },
        cards:    { type: [{ _id: false, text: String, id: String }], default: undefined },
    }],
    glossary: [{
        _id:   false,
        words: [String],
        ids:   [String],
        text:  String,
    }],
    credits: String,
    csi:     String,
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            return ret;
        },
    },
});

const CR = conn.model<Document & ICR>('cr', CRMenuSchema);

export default CR;
