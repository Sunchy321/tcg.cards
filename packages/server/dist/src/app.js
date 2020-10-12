"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const koa_1 = __importDefault(require("koa"));
const cors_1 = __importDefault(require("@koa/cors"));
const koa_session_1 = __importDefault(require("koa-session"));
const koa_logger_1 = __importDefault(require("koa-logger"));
const koa_body_1 = __importDefault(require("koa-body"));
// there is a bug in declaration of koa-easy-ws.
const koa_easy_ws_1 = __importDefault(require("koa-easy-ws"));
const passport_1 = __importDefault(require("user/passport"));
const subdomain_1 = __importDefault(require("./subdomain"));
const logger_1 = require("logger");
const port = process.env.NODE_ENV === 'production' ? 80 : 8889;
const app = new koa_1.default();
app.keys = ['secret key for tcg.cards'];
app.use(koa_session_1.default({}, app));
app.use(cors_1.default());
app.use(koa_body_1.default({ multipart: true }));
app.use(passport_1.default.initialize());
app.use(passport_1.default.session());
app.use(koa_logger_1.default());
app.use(koa_easy_ws_1.default());
app.use(subdomain_1.default.routes());
app.listen(port, () => {
    logger_1.main.info('Server is running at ' + port, { category: 'server' });
    console.log('Server is running at ' + port);
});
//# sourceMappingURL=app.js.map