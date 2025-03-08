import { Schema } from 'mongoose';

import { Patch as IPatch } from '@interface/hearthstone/patch';

import conn from './db';

const PatchSchema = new Schema<IPatch>({
    version:   String,
    shortName: String,
    number:    Number,
    hash:      String,

    isCurrent: {
        type:    Boolean,
        default: false,
    },

    isUpdated: {
        type:    Boolean,
        default: false,
    },
}, {
    toJSON: {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            return ret;
        },
    },
});

const Patch = conn.model<IPatch>('patch', PatchSchema);

export default Patch;
