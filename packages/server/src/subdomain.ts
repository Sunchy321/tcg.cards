import KoaRouter from '@koa/router';

import { Middleware } from 'koa';

function subdomain<StateT, ContextT>(sub: string, router: KoaRouter<StateT, ContextT>): Middleware<StateT, KoaRouter.RouterContext<StateT, ContextT>> {
    return async function (ctx, next) {
        const subdomains = ctx.subdomains;

        if (subdomains[0] === sub) {
            return router.routes()(ctx, next);
        }

        return next();
    };
}

export default subdomain;
