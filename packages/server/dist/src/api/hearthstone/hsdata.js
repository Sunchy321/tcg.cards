"use strict";
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const KoaRouter = __importStar(require("@koa/router"));
const hsdata_1 = require("hearthstone/hsdata");
const router = new KoaRouter();
router.prefix('/hsdata');
router.get('/', async (ctx) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        ctx.body = {
            hasData: hsdata_1.hasData(),
        };
    }
    else {
        ctx.status = 401;
    }
});
router.post('/get-data', async (ctx) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await hsdata_1.getData();
        ctx.status = 200;
    }
    else {
        ctx.status = 401;
    }
});
router.post('/load-data', async (ctx) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await hsdata_1.loadData();
        ctx.status = 200;
    }
    else {
        ctx.status = 401;
    }
});
router.post('/load-patch', async (ctx) => {
    if (ctx.isAuthenticated() && ctx.state.user.isAdmin()) {
        await hsdata_1.loadPatch(ctx.request.body.version);
        ctx.status = 200;
    }
    else {
        ctx.status = 401;
    }
});
exports.default = router;
//# sourceMappingURL=hsdata.js.map