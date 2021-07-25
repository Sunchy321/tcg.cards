import Task from '@/common/task';

import Card from '../db/scryfall/card';

import FileSaver from '@/common/save-file';

import { partition } from 'lodash';
import { cardImagePath } from '@/magic/image';

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
    failed: number;
}

export class ImageGetter extends Task<IImageStatus> {
    type:string;
    set: string;
    lang: string;

    projCount = 0;
    projTotal: number;
    total: number;
    failed = 0;
    todoTasks: IImageTask[] = [];
    taskMap: Record<string, [IImageTask, FileSaver]> = {};
    statusMap: Record<string, string> = {};

    constructor(type: string) {
        super();

        this.type = type;
    }

    async startImpl(): Promise<void> {
        const aggregate = Card.aggregate()
            .allowDiskUse(true)
            .match({ image_status: { $in: ['lowres', 'highres_scan'] } })
            .group({
                _id:   { set: '$set', lang: '$lang' },
                infos: {
                    $push: {
                        number:    '$collector_number',
                        uris:      '$image_uris',
                        partsUris: '$card_faces.image_uris',
                    },
                },
            })
            .addFields({ langIsEn: { $eq: ['$_id.lang', 'en'] } })
            .sort({ 'langIsEn': -1, '_id.lang': 1 });

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
                failed:  this.failed,
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

            for (const info of proj.infos.sort((a, b) => {
                const ma = /^(.*?)(?:-\d|[ab★])?$/.exec(a.number)![1];
                const mb = /^(.*?)(?:-\d|[ab★])?$/.exec(b.number)![1];

                const len = Math.max(ma.length, mb.length);

                const pa = ma.padStart(len, '0');
                const pb = mb.padStart(len, '0');

                return pa < pb ? -1 : pa > pb ? 1 : 0;
            })) {
                if (info.uris != null) {
                    const name = info.number;
                    this.todoTasks.push({
                        name,
                        uri:  info.uris[this.type],
                        path: cardImagePath(
                            this.type,
                            this.set,
                            this.lang,
                            info.number,
                        ),
                    });

                    this.statusMap[name] = 'waiting';
                }

                if (info.partsUris != null) {
                    for (let i = 0; i < info.partsUris.length; ++i) {
                        const name = info.number + '-' + i;

                        this.todoTasks.push({
                            name,
                            uri:  info.partsUris[i][this.type],
                            path: cardImagePath(
                                this.type,
                                this.set,
                                this.lang,
                                info.number,
                                i,
                            ),
                        });

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
                const savers = new FileSaver(task.uri, task.path);

                savers.on('end', () => {
                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'success';
                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }).on('error', () => {
                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'failed';

                    ++this.failed;

                    this.taskMap[task.name]?.[1]?.stop();

                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
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
