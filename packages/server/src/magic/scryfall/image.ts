import Task from '@/common/task';

import Card from '../db/scryfall/card';

import FileSaver from '@/common/save-file';
import { join } from 'path';

import { asset } from '@config';
import { partition } from 'lodash';

interface IImageProjection {
    _id: { set: string, lang:string },
    infos: { number: string, uris?: Record<string, string>, partsUris?: Record<string, string>[] }[]
}

interface IImageTask {
    name: string,
    uri: string,
    path: string
}

interface IImageStatus {
    overall: { count: number, total: number }
    current: { set: string, lang: string; }
    status: Record<string, string>
}

function addPath(
    data: Omit<IImageTask, 'path'>, type: string, set: string, lang: string,
): IImageTask {
    const ext = type === 'png' ? 'png' : 'jpg';

    const path = join(asset, 'magic', 'card', type, set, lang, `${data.name}.${ext}`);

    return { ...data, path };
}

export class ImageGetter extends Task<IImageStatus> {
    type:string;
    set: string;
    lang: string;

    projCount = 0;
    projTotal: number;
    total: number;
    todoTasks: IImageTask[] = [];
    taskMap: Record<string, [IImageTask, FileSaver]> = {};
    statusMap: Record<string, string> = {};

    constructor(type: string) {
        super();

        this.type = type;
    }

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

        this.todoTasks = [];
        this.taskMap = {};
        this.statusMap = {};

        this.intervalProgress(500, function () {
            return {
                overall: { count: this.projCount, total: this.projTotal },
                current: { set: this.set, lang: this.lang },
                status:  this.statusMap,
            };
        });

        for await (const proj of aggregate as unknown as AsyncGenerator<IImageProjection>) {
            if (this.status === 'idle') {
                return;
            }

            ++this.projCount;

            this.set = proj._id.set;
            this.lang = proj._id.lang;

            this.todoTasks = [];
            this.taskMap = {};
            this.statusMap = {};

            for (const info of proj.infos) {
                if (info.uris != null) {
                    const name = info.number;
                    this.todoTasks.push(addPath({
                        name,
                        uri: info.uris[this.type],
                    }, this.type, this.set, this.lang));

                    this.statusMap[name] = 'waiting';
                }

                if (info.partsUris != null) {
                    for (let i = 0; i < info.partsUris.length; ++i) {
                        const name = info.number + '-' + i;

                        this.todoTasks.push(addPath({
                            name,
                            uri: info.partsUris[i][this.type],
                        }, this.type, this.set, this.lang));

                        this.statusMap[name] = 'waiting';
                    }
                }
            }

            this.total = this.todoTasks.length;

            const [exists, nonexist] = partition(this.todoTasks, task => FileSaver.fileExists(task.path));

            for (const task of exists) {
                this.statusMap[task.name] = 'success';
            }

            this.todoTasks = nonexist;

            await this.waitForTasks();
        }

        this.postIntervalProgress();
        this.emit('end');
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
                resolve();
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
        while (this.working() < 10 && this.todoTasks.length > 0) {
            const task = this.todoTasks.shift()!;

            if (task != null) {
                const savers = new FileSaver(task.uri, task.path);

                savers.on('end', () => {
                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'success';
                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }).on('error', err => {
                    this.statusMap[task.name] = 'failed';

                    for (const k in this.taskMap) {
                        this.taskMap[k][1].stop();
                        this.statusMap[k] = 'aborted';
                    }

                    this.postIntervalProgress();
                    this.emit('error', err);
                });

                this.taskMap[task.name] = [task, savers];
                this.statusMap[task.name] = 'working';
                savers.start();
            } else {
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
