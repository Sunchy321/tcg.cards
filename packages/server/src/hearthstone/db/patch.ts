import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IPatch extends Document {
    version: string;
    sha: string;
    isUpdated: boolean;

    json(): {
        version: string;
        isUpdated: string;
    };
}

const PatchSchema = new Schema({
    version: String,
    sha:     String,

    isUpdated: {
        type:    Boolean,
        default: false,
    },
});

PatchSchema.methods.json = function () {
    return {
        version:   this.version,
        isUpdated: this.isUpdated,
    };
};

const Patch = conn.model<IPatch>('patch', PatchSchema);

export default Patch;
