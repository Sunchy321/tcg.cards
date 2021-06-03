import { Middleware } from 'koa';

import KoaRouter from '@koa/router';

import { last } from 'lodash';

function subdomain<StateT, ContextT>(sub: string, router: KoaRouter<StateT, ContextT>): Middleware<StateT, KoaRouter.RouterContext<StateT, ContextT>> {
    return async function (ctx, next) {
        if (last(ctx.subdomains) === sub) {
            return router.routes()(ctx, next);
        }

        return next();
    };
}

export default subdomain;
