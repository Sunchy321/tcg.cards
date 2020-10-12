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
const passport_1 = __importDefault(require("./passport"));
const user_1 = __importDefault(require("db/user/user"));
const logger = __importStar(require("logger"));
const router = new KoaRouter();
router.post('/register', async (ctx, next) => {
    const { username, password } = ctx.request.body;
    const user = await user_1.default.register(new user_1.default({ username }), password);
    if (user != null) {
        logger.user.info(username, { category: 'register' });
        return passport_1.default.authenticate('local', (err, user, info, status) => {
            if (user != null) {
                ctx.body = user.profile();
                return ctx.login(user);
            }
            else {
                ctx.body = { failure: 'LoginFailed' };
            }
        })(ctx, next);
    }
    else {
        ctx.body = { failure: 'UserDuplicate' };
    }
});
router.post('/login', async (ctx, next) => {
    return passport_1.default.authenticate('local', (err, user, info, status) => {
        if (user != null) {
            ctx.body = user.profile();
            logger.user.info(user.username, { category: 'login' });
            return ctx.login(user);
        }
        else {
            ctx.body = { failure: 'UsernamePasswordMismatch' };
        }
    })(ctx, next);
});
router.post('/logout', async (ctx) => {
    logger.user.info(ctx.state.user.username, { category: 'logout' });
    ctx.logout();
    ctx.body = { success: true };
});
router.get('/profile', async (ctx) => {
    if (ctx.isAuthenticated()) {
        const user = ctx.state.user;
        ctx.body = user.profile();
    }
    else {
        ctx.body = {
            failure: 'NotLoggedIn',
        };
    }
});
exports.default = router;
//# sourceMappingURL=router.js.map