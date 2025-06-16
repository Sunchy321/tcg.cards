import Task from '@/common/task';

import Print from '@/magic/db/print';

import FileSaver from '@/common/save-file';

import { partition } from 'lodash';
import { cardImagePath } from '@/magic/image';

interface IImageTask {
    name: string;
    uri:  string;
    path: string;
}

interface IImageStatus {
    amount: { count: number, total: number };
    time:   { elapsed: number, remaining: number };
    status: Record<string, string>;
    failed: number;
}

export async function saveGathererImage(mids: number[], set: string, number: string, lang: string): Promise<void> {
    if (mids.length === 1) {
        const saver = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number),
        );

        saver.start();

        await saver.waitForEnd();
    } else {
        const saverFront = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number, 0),
        );

        const saverBack = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[1]}&type=card`,
            cardImagePath('large', set, lang, number, 1),
        );

        saverFront.start();
        saverBack.start();

        await Promise.all([saverFront.waitForEnd(), saverBack.waitForEnd()]);
    }
}

function gathererImageUrl(multiverseId: number): string {
    return `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${multiverseId}&type=card`;
}

export class GathererImageTask extends Task<IImageStatus> {
    set:       string;
    count = 0;
    total:     number;
    failed = 0;
    todoTasks: IImageTask[] = [];
    taskMap:   Record<string, [IImageTask, FileSaver]> = {};
    statusMap: Record<string, string> = {};

    constructor(set: string) {
        super();

        this.set = set;
    }

    async startImpl(): Promise<void> {
        const prints = await Print.find({ 'set': this.set, 'multiverseId.0': { $exists: true } });

        this.count = 0;
        this.total = prints.length;

        this.todoTasks = [];
        this.taskMap = {};
        this.statusMap = {};

        const start = Date.now();

        this.intervalProgress(500, function () {
            const elapsed = Date.now() - start;

            const time = {
                elapsed,
                remaining: (elapsed / this.count) * (this.total - this.count),
            };

            return {
                amount: { count: this.count, total: this.total },
                time,
                status: this.statusMap,
                failed: this.failed,
            };
        });

        this.todoTasks = [];
        this.taskMap = {};
        this.statusMap = {};

        for (const p of prints) {
            if (this.status === 'idle') {
                return;
            }

            if (p.multiverseId.length === 1) {
                this.todoTasks.push({
                    name: `${p.number}:${p.lang}`,
                    uri:  gathererImageUrl(p.multiverseId[0]),
                    path: cardImagePath('large', p.set, p.lang, p.number),
                });
            } else {
                this.todoTasks.push({
                    name: `${p.number}:${p.lang}-0`,
                    uri:  gathererImageUrl(p.multiverseId[0]),
                    path: cardImagePath('large', p.set, p.lang, p.number, 0),
                });

                this.todoTasks.push({
                    name: `${p.number}:${p.lang}-1`,
                    uri:  gathererImageUrl(p.multiverseId[1]),
                    path: cardImagePath('large', p.set, p.lang, p.number, 1),
                });
            }
        }

        const [exists, nonexist] = partition(this.todoTasks, task => FileSaver.fileExists(task.path));

        for (const task of exists) {
            this.statusMap[task.name] = 'exists';
        }

        this.count += exists.length;

        this.todoTasks = nonexist;

        await this.waitForTasks();
    }

    private rest() {
        return this.todoTasks.length;
    }

    private working() {
        return Object.keys(this.taskMap).length;
    }

    private async waitForTasks() {
        const promise = new Promise((resolve, reject) => {
            this.once('all-end', () => {
                this.off('error', reject);
                resolve(null);
            }).on('error', reject);
        });

        if (this.rest() === 0) {
            this.emit('all-end');
        } else {
            this.pushTask();
        }

        return promise;
    }

    private pushTask() {
        while (this.working() < 20 && this.rest() > 0) {
            const randomIndex = Math.floor(Math.random() * this.todoTasks.length);

            const task = this.todoTasks[randomIndex];

            this.todoTasks.splice(randomIndex, 1);

            if (task != null) {
                const savers = new FileSaver(task.uri, task.path, {
                    axiosOption: {
                        timeout: 5000,
                    },
                });

                savers.on('end', () => {
                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'success';
                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }).on('error', (err: Error) => {
                    if (err.message === 'aborted') {
                        return;
                    }

                    console.log(task.name, err.message);

                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'failed';

                    this.failed += 1;

                    this.taskMap[task.name]?.[1]?.stop();

                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                });

                this.taskMap[task.name] = [task, savers];
                this.statusMap[task.name] = 'working';
                savers.start();
            } else if (this.rest() === 0 && this.working() === 0) {
                this.emit('all-end');
            }
        }
    }

    stopImpl(): void {
        this.todoTasks = [];

        for (const task of Object.values(this.taskMap)) {
            task[1].stop();
        }
    }

    equals(): boolean { return true; }
}
