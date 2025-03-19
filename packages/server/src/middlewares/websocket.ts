import { Context, Next } from 'koa';
import ws from 'ws';

declare module 'koa' {
    interface DefaultContext {
        ws: () => Promise<ws>;
    }
}

export default function websocket(ctx: Context, next: Next): any {
    if (ctx.ws != null) {
        return next();
    } else {
        ctx.status = 404;
    }
}
