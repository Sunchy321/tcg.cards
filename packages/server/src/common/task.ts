import { EventEmitter } from 'events';
import { Context } from 'hono';
import { streamSSE } from 'hono/streaming';

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

    bind(c: Context): Response {
        c.req.raw.signal.addEventListener('abort', () => {
            this.stop();
        });

        return streamSSE(c, async stream => {
            this
                .on('progress', p => {
                    stream.writeSSE({
                        data:  JSON.stringify(p),
                        event: 'progress',
                    });
                })
                .on('error', async e => {
                    await stream.writeSSE({
                        data:  JSON.stringify({ error: e }),
                        event: 'close',
                    });

                    stream.close();
                })
                .on('end', async () => {
                    await stream.writeSSE({
                        data:  '',
                        event: 'close',
                    });

                    stream.close();
                });

            stream.onAbort(() => { this.stop(); });

            this.start();

            while (!stream.aborted && !stream.closed) {
                await stream.sleep(100);
            }
        });
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

    async* intoGenerator() {
        this.start();

        while (true) {
            const { promise, resolve, reject } = Promise.withResolvers<
                { type: 'progress', value: T } | { type: 'end' }
            >();

            this.once('progress', (p: T) => {
                resolve({ type: 'progress', value: p });
            });

            this.once('end', () => {
                resolve({ type: 'end' });
            });

            this.once('error', (e: any) => {
                reject(e);
            });

            const result = await promise;

            if (result.type === 'progress') {
                yield result.value;
            } else {
                break;
            }
        }
    }
}

export default Task;
