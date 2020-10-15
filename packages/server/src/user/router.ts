import KoaRouter from '@koa/router';
import { Context, DefaultState } from 'koa';

import User from '@/db/user/user';

import jwtAuth from '@/middlewares/jwt-auth';

import * as logger from '@/logger';

const router = new KoaRouter<DefaultState, Context>();

router.post('/register', async ctx => {
    const { username, password } = ctx.request.body;

    try {
        const user = await User.register(username, password);
        const token = User.toJwtToken(user);

        logger.user.info(username, { category: 'register' });

        ctx.body = { token };
    } catch (e) {
        ctx.body = { error: e.message };
    }
});

router.post('/login', async ctx => {
    const { username, password } = ctx.request.body;

    try {
        const user = await User.authenticate(username, password);
        const token = User.toJwtToken(user);

        logger.user.info(username, { category: 'login' });

        ctx.body = { token };
    } catch (e) {
        ctx.body = { error: e.message };
    }
});

router.get('/refresh', jwtAuth({ pass: true }), async ctx => {
    const user = ctx.state.user;

    if (user != null) {
        ctx.body = { token: User.toJwtToken(user) };
    } else {
        ctx.body = { error: 'not_logged_in' };
    }
});

router.get('/profile', jwtAuth(), async ctx => {
    const user = ctx.state.user;

    ctx.body = user.profile();
});

export default router;
