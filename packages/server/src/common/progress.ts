/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/no-explicit-any */

import WebSocket from 'ws';

type ProgressCallback<T> = (progress: T) => void;

export abstract class ProgressHandler<T> {
    progressCallbacks: ProgressCallback<T>[] = [];
    endCallbacks: (() => void)[] = [];

    onProgress(callback: ProgressCallback<T>): void {
        this.progressCallbacks.push(callback);
    }

    onEnd(callback: () => void): void {
        this.endCallbacks.push(callback);
    }

    protected emitProgress(prog: T): void {
        for (const f of this.progressCallbacks) {
            f(prog);
        }
    }

    private emitEnd() {
        for (const f of this.endCallbacks) {
            f();
        }
    }

    protected abstract action(): Promise<void>;

    async exec(): Promise<void> {
        await this.action();

        this.emitEnd();
    }

    abstract abort(): void;
    abstract equals(...args: any[]): boolean;
}

export class ProgressWebSocket<T> {
    creator: { new(...args: any[]) : ProgressHandler<T> };
    handler: ProgressHandler<T> | null;

    constructor(creator: { new(...args: any[]) : ProgressHandler<T> }) {
        this.creator = creator;
    }

    bind(ws: WebSocket, ...args: any[]): void {
        if (this.handler == null || !this.handler.equals(...args)) {
            this.handler = new this.creator(...args);
        }

        this.handler.onProgress(p => {
            ws.send(JSON.stringify(p));
        });

        this.handler.onEnd(() => {
            this.handler = null;
            ws.close();
        });
    }

    async exec(): Promise<void> {
        if (this.handler != null) {
            return this.handler.exec();
        }
    }
}
