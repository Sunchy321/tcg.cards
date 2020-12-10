import { Document, Schema } from 'mongoose';

import conn from './db';

export interface ICRContent {
    id: string;
    depth: number;
    index: string;
    text: string;
    examples?: string[];
    cards?: { text:string, id:string }[]
}

export interface ICRGlossary {
    words: string[];
    ids: string[];
    text: string;
}

export interface ICR {
    date: string;
    intro: string;
    contents: ICRContent[];
    glossary: ICRGlossary[];
    credits: string;
}

const CRMenuSchema = new Schema({
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
});

const CR = conn.model<ICR & Document>('cr', CRMenuSchema);

export default CR;
