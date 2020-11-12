import Task from '@/common/task';

import Card from '../db/scryfall/card';

import { IStatus } from './interface';

import FileSaver from '@/common/save-file';
import { join } from 'path';

import { asset } from '@config';
import { EventEmitter } from 'events';

class FileSavers extends EventEmitter {
    savers: FileSaver[] = [];
    private finished = 0;

    constructor(pairs: [string, string][]) {
        super();

        for (const p of pairs) {
            const saver = new FileSaver(p[0], p[1]);

            saver.on('end', () => {
                ++this.finished;

                if (this.finished === this.savers.length) {
                    this.emit('end');
                }
            }).on('error', err => {
                for (const s of this.savers) {
                    s.stop();
                }

                this.emit('error', err);
            });

            this.savers.push(saver);
        }
    }

    start(): void {
        for (const saver of this.savers) {
            saver.start();
        }
    }

    stop(): void {
        for (const saver of this.savers) {
            saver.stop();
        }
    }
}

interface IImageProjection {
    _id: { set: string, lang:string },
    info: { number: string, uris: Record<string, string> }[]
}

export class ImageGetter extends Task<IStatus> {
    set: string;
    lang: string;

    projCount = 0;
    projTotal: number;
    total: number;
    todoTasks: { number: string, uris: Record<string, string> }[] = [];
    taskMap: Record<string, FileSavers> = {};

    async startImpl(): Promise<void> {
        const files = await Card.aggregate([
            { $group: { _id: '$file' } },
            { $sort: { _id: -1 } },
        ]);

        const lastFile = files[0]._id;

        const query = {
            image_uris: { $exists: true },
            file:       lastFile,

            lang: 'ph',
        };

        const aggregate = Card.aggregate().match(query).group({
            _id:  { set: '$set_id', lang: '$lang' },
            info: { $push: { number: '$collector_number', uris: '$image_uris' } },
        }).allowDiskUse(true);

        const total = await Card.aggregate(aggregate.pipeline()).count('total');

        this.projCount = 0;
        this.projTotal = total[0].total;

        for await (const proj of aggregate as unknown as AsyncGenerator<IImageProjection>) {
            if (this.status === 'idle') {
                return;
            }

            this.set = proj._id.set;
            this.lang = proj._id.lang;

            this.todoTasks = proj.info;
            this.total = proj.info.length;

            ++this.projCount;

            await this.waitForTasks();
        }

        this.emit('end');
    }

    private rest() {
        return this.todoTasks.length;
    }

    private working() {
        return Object.keys(this.taskMap).length;
    }

    private print() {
        const finished = this.total - this.rest() - this.working();

        process.stdout.write('\r' + ' '.repeat(80) + '\r');

        process.stdout.write(`${this.set} ${this.projCount}/${this.projTotal} ${this.lang} ${finished}/${this.total}`);

        for (const n in this.taskMap) {
            process.stdout.write(' ' + n);
        }
    }

    private async waitForTasks() {
        const promise = new Promise((resolve, reject) => {
            this.once('all-end', () => {
                console.log();
                this.off('error', reject);
                resolve();
            }).on('error', reject);
        });

        this.pushTask();

        return promise;
    }

    private pushTask() {
        while (this.working() < 10 && this.todoTasks.length > 0) {
            const task = this.todoTasks.shift()!;

            const pairs = Object
                .entries(task.uris)
                .filter(v => v[0] === 'png')
                .map(([type, uri]): [string, string] => {
                    const ext = type === 'png' ? 'png' : 'jpg';
                    const path = join(asset, 'magic', 'card', type, this.set, this.lang, task.number + '.' + ext);

                    return [uri, path];
                })
                .filter(v => !FileSaver.fileExists(v[1]));

            if (pairs.length > 0) {
                const savers = new FileSavers(pairs);

                savers.on('end', () => {
                    delete this.taskMap[task.number];
                    this.print();
                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }).on('error', err => {
                    for (const k in this.taskMap) {
                        this.taskMap[k].stop();
                    }

                    this.emit('error', err);
                });

                this.taskMap[task.number] = savers;
                this.print();
                savers.start();
            } else {
                this.print();

                if (this.rest() === 0 && this.working() === 0) {
                    this.emit('all-end');
                }
            }
        }
    }

    stopImpl(): void {
        this.todoTasks = [];

        for (const k in this.taskMap) {
            this.taskMap[k].stop();
        }
    }

    equals(): boolean { return true; }
}
