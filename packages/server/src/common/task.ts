/* eslint-disable new-cap */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { EventEmitter } from 'events';

import WebSocket from 'ws';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
abstract class Task<T> extends EventEmitter {
    status: 'idle' | 'working' | 'error';
    private intervalProgressId?: NodeJS.Timeout;
    private intervalProgressFunc?: (this: this) => T;

    constructor() {
        super();

        this.status = 'idle';

        this.on('end', () => {
            if (this.intervalProgressId != null) {
                this.intervalProgressFunc?.();
                clearInterval(this.intervalProgressId);
                this.intervalProgressId = undefined;
            }

            this.status = 'idle';
        });

        this.on('error', () => {
            this.stop();
        });
    }

    bind(ws: WebSocket): void {
        this
            .on('progress', p => ws.send(JSON.stringify(p)))
            .on('end', () => ws.close());

        ws.on('close', () => this.stop());

        this.start();
    }

    start(): void {
        if (this.status === 'idle') {
            this.status = 'working';
            this.startImpl();
        }
    }

    stop(): void {
        if (this.status === 'working' || this.status === 'error') {
            this.stopImpl();
            this.emit('end');
        }
    }

    waitForEnd(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.on('end', resolve).on('error', reject);
        });
    }

    protected abstract startImpl(): void;
    protected abstract stopImpl(): void;

    intervalProgress(ms: number, func: (this: this) => T): void {
        const postProgress = function() {
            const prog = func.call(this) as T;

            this.emit('progress', prog);
        }.bind(this);

        this.intervalProgressFunc = postProgress;
        this.intervalProgressId = setInterval(postProgress, ms);
    }

    postIntervalProgress():void {
        this.intervalProgressFunc?.();
    }
}

export default Task;
