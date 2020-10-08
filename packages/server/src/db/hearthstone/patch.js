import { Schema } from 'mongoose';

import conn from './db';

const PatchSchema = new Schema({
    version: String,
    sha: String,

    isUpdated: {
        type: Boolean,
        default: false,
    },
});

PatchSchema.methods.profile = function () {
    return {
        version: this.version,
        isUpdated: this.isUpdated,
    };
};

const Patch = conn.model('patch', PatchSchema);

export default Patch;
