"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const passportLocalMongoose = __importStar(require("passport-local-mongoose"));
const db_1 = __importDefault(require("./db"));
const UserSchema = new mongoose_1.Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
    },
    role: {
        type: String,
        enum: ['normal', 'admin'],
        required: true,
        default: 'normal',
    },
});
UserSchema.plugin(passportLocalMongoose);
UserSchema.methods.profile = function () {
    return {
        username: this.username,
        role: this.role,
    };
};
UserSchema.methods.isAdmin = function () {
    return this.role === 'admin';
};
const User = db_1.default.model('user', UserSchema);
exports.default = User;
//# sourceMappingURL=user.js.map