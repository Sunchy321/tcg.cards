import { Context, Next, Middleware } from 'koa';

export interface JwtAuthOption {
    /**
     * unauthorized access will pass through instead of return 401.
     */
    pass?: boolean;

    /**
     * need user to be admin
     */
    admin?: boolean;
}

export default function jwtAuth(): Middleware {
    return async function (ctx: Context, next: Next): Promise<any> {
        return next();
    };
}
