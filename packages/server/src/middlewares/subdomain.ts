import { Middleware } from 'koa';

import KoaRouter, { RouterContext } from '@koa/router';
import { WebSocketContext } from 'koa-easy-ws';

import { last } from 'lodash';

function subdomain<StateT, ContextT>(
    sub: string,
    router: KoaRouter<StateT, ContextT>,
): Middleware<StateT, RouterContext<StateT, ContextT> & WebSocketContext<'ws'>> {
    return async function (ctx, next) {
        if (last(ctx.subdomains) === sub) {
            return router.routes()(ctx, next);
        }

        return next();
    };
}

export default subdomain;
