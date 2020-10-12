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
const KoaRouter = __importStar(require("@koa/router"));
const hearthstone_1 = __importDefault(require("./hearthstone"));
const basic_1 = __importDefault(require("@data/basic"));
const router = new KoaRouter();
router.get('/', async (ctx) => {
    ctx.body = {
        games: basic_1.default.games,
    };
});
router.use(hearthstone_1.default.routes());
exports.default = router;
//# sourceMappingURL=index.js.map