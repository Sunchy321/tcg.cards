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
const hsdata_1 = __importDefault(require("./hsdata"));
const patch_1 = __importDefault(require("db/hearthstone/patch"));
const router = new KoaRouter();
router.prefix('/hearthstone');
router.use(hsdata_1.default.routes());
router.get('/patches', async (ctx) => {
    const patches = await patch_1.default.find();
    ctx.body = patches.map(p => p.json());
});
exports.default = router;
//# sourceMappingURL=index.js.map