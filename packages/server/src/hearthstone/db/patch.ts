import { Document, Schema } from 'mongoose';

import { Patch as IPatch } from '@interface/hearthstone/patch';

import conn from './db';

const PatchSchema = new Schema<IPatch>({
    version:   String,
    shortName: String,
    number:    Number,
    hash:      String,

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

interface IPatchJSON {
    version: string;
    isUpdated: boolean;
}

interface IPatchMethods {
    json(): IPatchJSON;
}

PatchSchema.methods.json = function (this: IPatch): IPatchJSON {
    return {
        version:   this.version,
        isUpdated: this.isUpdated,
    };
};

const Patch = conn.model<Document & IPatch & IPatchMethods>('patch', PatchSchema);

export default Patch;
