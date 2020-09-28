import { Schema } from 'mongoose';

export const VersionSchema = new Schema({
    name: String,
    id: Number,
    hsdataSha: String
})