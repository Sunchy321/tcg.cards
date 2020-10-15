/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Next, Middleware } from 'koa';

import User, { IUser } from '@/db/user/user';

declare module 'koa' {
    interface DefaultState {
        user: IUser
    }
}

function getJwtToken(ctx: Context): string | undefined {
    if (ctx.header.authentication != null) {
        return ctx.header.authentication;
    } else if (ctx.query.jwt != null) {
        return ctx.query.jwt;
    }
}

export class JwtAuthOption {
    /**
     * unauthorized access will pass through instead of return 401.
     */
    pass?: boolean = false

    /**
     * need user to be admin
     */
    admin?: boolean = false
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function jwtAuth(option: JwtAuthOption = { }): Middleware {
    return async function(ctx: Context, next: Next): Promise<any> {
        const token = getJwtToken(ctx);

        if (token != null) {
            const user = await User.fromJwtToken(token);

            if (user != null && (!option.admin || user.isAdmin())) {
                ctx.state.user = user;
            } else {
                ctx.status = 401;
            }
        } else {
            ctx.status = 401;
        }

        if (ctx.status !== 401 || option.pass) {
            return next();
        }
    };
}
