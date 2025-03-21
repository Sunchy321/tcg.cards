import { EventEmitter } from 'events';

import WebSocket from 'ws';

abstract class Task<T> extends EventEmitter {
    status: 'error' | 'idle' | 'working';

    private intervalProgressId?:   NodeJS.Timeout;
    private intervalProgressFunc?: () => void;

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
            .on('progress', p => { ws.send(JSON.stringify(p)); })
            .on('error', e => {
                ws.send(JSON.stringify({ error: true, ...e }));
                console.log(e);
                ws.close();
            })
            .on('end', () => { ws.close(); });

        ws.on('close', () => { this.stop(); });

        this.start();
    }

    async start(): Promise<void> {
        if (this.status === 'idle') {
            this.status = 'working';

            try {
                const result = await this.startImpl();
                this.postIntervalProgress();
                this.emit('end', result);
            } catch (e) {
                this.emit('error', e);
            }
        }
    }

    stop(): void {
        if (this.status === 'working' || this.status === 'error') {
            this.stopImpl();
            this.emit('end');
        }
    }

    async waitForEnd(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.on('end', resolve).on('error', reject);
        });
    }

    protected abstract startImpl(): any;

    protected abstract stopImpl(): void;

    intervalProgress(ms: number, func: (this: this) => T): void {
        const postProgress = function () {
            const prog = func.call(this) as T;

            this.emit('progress', prog);
        }.bind(this) as () => void;

        this.intervalProgressFunc = postProgress;
        this.intervalProgressId = setInterval(postProgress, ms);
    }

    postIntervalProgress(): void {
        this.intervalProgressFunc?.();
    }
}

export default Task;
