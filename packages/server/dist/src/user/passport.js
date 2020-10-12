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
const passport = __importStar(require("koa-passport"));
const passport_local_1 = require("passport-local");
const user_1 = __importDefault(require("db/user/user"));
passport.use(new passport_local_1.Strategy(user_1.default.authenticate()));
passport.serializeUser(user_1.default.serializeUser());
passport.deserializeUser(user_1.default.deserializeUser());
exports.default = passport;
//# sourceMappingURL=passport.js.map