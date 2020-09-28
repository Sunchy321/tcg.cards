import KoaRouter from '@koa/router';

import passport from './passport';

import User from '~/db/user/user';

import * as logger from '@/logger';

const router = new KoaRouter();

router.post('/register', async (ctx, next) => {
    const { username, password } = ctx.request.body;
    const user = await User.register(username, password);

    if (user != null) {
        logger.user.info(username, { category: 'register' });
        ctx.body = true;
    } else {
        ctx.body = false;
    }
});

router.post('/login', async (ctx, next) => {
    return passport.authenticate('local', (err, user, info, status) => {
        if (user) {
            ctx.body = true;
            logger.user.info(user.username, { category: 'login' });
            return ctx.login(user);
        } else {
            ctx.body = false;
        }
    })(ctx, next);
});

router.post('/logout', async (ctx, next) => {
    ctx.logout();
    logger.user.info(username, { category: 'logout' });
    ctx.body = true;
})

export default router;