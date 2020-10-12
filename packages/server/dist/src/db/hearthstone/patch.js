"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const db_1 = __importDefault(require("./db"));
const PatchSchema = new mongoose_1.Schema({
    version: String,
    sha: String,
    isUpdated: {
        type: Boolean,
        default: false,
    },
});
PatchSchema.methods.json = function () {
    return {
        version: this.version,
        isUpdated: this.isUpdated,
    };
};
const Patch = db_1.default.model('patch', PatchSchema);
exports.default = Patch;
//# sourceMappingURL=patch.js.map