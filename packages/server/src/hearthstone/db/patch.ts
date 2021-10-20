import { Document, Schema } from 'mongoose';

import conn from './db';

export interface IPatch {
    version: string;
    number: number;
    hash: string;
    isUpdated: boolean;
}

const PatchSchema = new Schema<IPatch>({
    version: String,
    number:  Number,
    hash:    String,

    isUpdated: {
        type:    Boolean,
        default: false,
    },
});

interface IPatchJSON {
    version: string;
    isUpdated: boolean;
}

interface IPatchMethods {
    json(): IPatchJSON
}

PatchSchema.methods.json = function (this: IPatch): IPatchJSON {
    return {
        version:   this.version,
        isUpdated: this.isUpdated,
    };
};

const Patch = conn.model<IPatch & IPatchMethods & Document>('patch', PatchSchema);

export default Patch;
