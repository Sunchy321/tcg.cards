import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import passport from './passport';

import User from '@/db/user/user';

import * as logger from '@/logger';

const router = new KoaRouter<DefaultState, Context>();

router.post('/register', async (ctx, next) => {
    const { username, password } = ctx.request.body;
    const user = await User.register(new User({ username }), password);

    if (user != null) {
        logger.user.info(username, { category: 'register' });

        return passport.authenticate('local', (err, user) => {
            if (err != null) {
                throw err;
            }

            if (user != null) {
                ctx.body = user.profile();
                return ctx.login(user);
            } else {
                ctx.body = { failure: 'LoginFailed' };
            }
        })(ctx, next);
    } else {
        ctx.body = { failure: 'UserDuplicate' };
    }
});

router.post('/login', async (ctx, next) => {
    return passport.authenticate('local', (err, user) => {
        if (err != null) {
            throw err;
        }

        if (user != null) {
            ctx.body = user.profile();
            logger.user.info(user.username, { category: 'login' });
            return ctx.login(user);
        } else {
            ctx.body = { failure: 'UsernamePasswordMismatch' };
        }
    })(ctx, next);
});

router.post('/logout', async ctx => {
    logger.user.info(ctx.state.user.username, { category: 'logout' });
    ctx.logout();
    ctx.body = { success: true };
});

router.get('/profile', async ctx => {
    if (ctx.isAuthenticated()) {
        const user = ctx.state.user;

        ctx.body = user.profile();
    } else {
        ctx.body = {
            failure: 'NotLoggedIn',
        };
    }
});

export default router;
