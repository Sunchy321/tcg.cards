import Task from '@/common/task';

import Card from '../db/scryfall/card';

import { IStatus } from './interface';

import FileSaver from '@/common/save-file';
import { join } from 'path';
import readline from 'readline';

import { asset } from '@config';

interface IImageProjection {
    _id: { set: string, lang:string },
    infos: { number: string, uris?: Record<string, string>, partsUris?: Record<string, string>[] }[]
}

interface IImageTask {
    number: string,
    part?: number,
    type: string,
    uri: string,
    path: string
}

function addPath(data: Omit<IImageTask, 'path'>, set: string, lang: string): IImageTask {
    const ext = data.type === 'png' ? 'png' : 'jpg';

    const path = data.part != null
        ? join(asset, 'magic', 'card', data.type, set, lang, `${data.number}-${data.part}.${ext}`)
        : join(asset, 'magic', 'card', data.type, set, lang, `${data.number}.${ext}`);

    return { ...data, path };
}

export class ImageGetter extends Task<IStatus> {
    set: string;
    lang: string;

    projCount = 0;
    projTotal: number;
    total: number;
    todoTasks: IImageTask[] = [];
    taskMap: Record<string, [IImageTask, FileSaver]> = {};

    async startImpl(): Promise<void> {
        const files = await Card.aggregate([
            { $group: { _id: '$file' } },
            { $sort: { _id: -1 } },
        ]);

        const lastFile = files[0]._id;

        const aggregate = Card.aggregate()
            .allowDiskUse(true)
            .match({ file: lastFile })
            .group({
                _id:   { set: '$set_id', lang: '$lang' },
                infos: {
                    $push: {
                        number:    '$collector_number',
                        uris:      '$image_uris',
                        partsUris: '$card_faces.image_uris',
                    },
                },
            });

        const total = await Card.aggregate(aggregate.pipeline()).allowDiskUse(true).count('total');

        this.projCount = 0;
        this.projTotal = total[0].total;

        for await (const proj of aggregate as unknown as AsyncGenerator<IImageProjection>) {
            if (this.status === 'idle') {
                return;
            }

            ++this.projCount;

            this.set = proj._id.set;
            this.lang = proj._id.lang;

            this.todoTasks = [];

            for (const info of proj.infos) {
                if (info.uris != null) {
                    for (const type in info.uris) {
                        this.todoTasks.push(addPath({
                            number: info.number,
                            type,
                            uri:    info.uris[type],
                        }, this.set, this.lang));
                    }
                }

                if (info.partsUris != null) {
                    for (let i = 0; i < info.partsUris.length; ++i) {
                        for (const type in info.partsUris[i]) {
                            this.todoTasks.push(addPath({
                                number: info.number,
                                part:   i,
                                type,
                                uri:    info.partsUris[i][type],
                            }, this.set, this.lang));
                        }
                    }
                }
            }

            this.todoTasks = this.todoTasks.filter(task => task.type === 'png');

            this.total = this.todoTasks.length;

            this.todoTasks = this.todoTasks.filter(task => !FileSaver.fileExists(task.path));

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

        readline.clearLine(process.stdout, 0);

        process.stdout.write('\r' + ' '.repeat(80) + '\r');

        process.stdout.write(`${this.set} ${this.projCount}/${this.projTotal} ${this.lang} ${finished}/${this.total}`);

        for (const n in this.taskMap) {
            const task = this.taskMap[n][0];

            const info = task.part != null
                ? `${task.number}-${task.part}/${task.type}`
                : `${task.number}/${task.type}`;

            process.stdout.write(' ' + info);
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

        if (this.rest() === 0) {
            this.print();
            this.emit('all-end');
        } else {
            this.pushTask();
        }

        return promise;
    }

    private pushTask() {
        while (this.working() < 10 && this.todoTasks.length > 0) {
            const task = this.todoTasks.shift()!;

            if (task != null) {
                const savers = new FileSaver(task.uri, task.path);

                savers.on('end', () => {
                    delete this.taskMap[task.number];
                    this.print();
                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }).on('error', err => {
                    for (const k in this.taskMap) {
                        this.taskMap[k][1].stop();
                    }

                    this.emit('error', err);
                });

                this.taskMap[task.number] = [task, savers];
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
            this.taskMap[k][1].stop();
        }
    }

    equals(): boolean { return true; }
}
