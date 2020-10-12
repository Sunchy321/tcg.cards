"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_subdomain_1 = __importDefault(require("koa-subdomain"));
const api_1 = __importDefault(require("api"));
const router_1 = __importDefault(require("user/router"));
const subdomain = new koa_subdomain_1.default();
subdomain.use('api', api_1.default.routes());
subdomain.use('user', router_1.default.routes());
exports.default = subdomain;
//# sourceMappingURL=subdomain.js.map