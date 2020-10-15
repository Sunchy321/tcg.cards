import { Context, Next } from 'koa';
import WebSocket from 'ws';

declare module 'koa' {
    interface DefaultContext {
        ws: () => Promise<WebSocket>
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function websocket(ctx: Context, next: Next): any {
    if (ctx.ws != null) {
        return next();
    } else {
        ctx.status = 404;
    }
}
