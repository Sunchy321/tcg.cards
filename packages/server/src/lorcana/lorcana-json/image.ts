import Task from '@/common/task';

import Print from '@/lorcana/db/print';

import FileSaver from '@/common/save-file';

import { join } from 'path';
import { partition } from 'lodash';
import { assetPath } from '@/config';

interface IImageProjection {
    _id:   { set: string, lang: string };
    infos: { number: string, uri: string }[];
}

interface IImageTask {
    name: string;
    uri:  string;
    path: string;
}

interface IImageStatus {
    overall: { count: number, total: number };
    current: { set: string, lang: string };
    status:  Record<string, string>;
    failed:  number;
}

function cardImagePath(
    ext: string,
    set: string,
    lang: string,
    number: string,
): string {
    return join(assetPath, 'lorcana', 'card', 'image', set, lang, `${number}.${ext}`);
}

export class ImageGetter extends Task<IImageStatus> {
    set:       string;
    lang:      string;
    projCount = 0;
    projTotal: number;
    total:     number;
    failed = 0;
    todoTasks: IImageTask[] = [];
    taskMap:   Record<string, [IImageTask, FileSaver]> = {};
    statusMap: Record<string, string> = {};

    async startImpl(): Promise<void> {
        const aggregate = Print.aggregate<IImageProjection>()
            .allowDiskUse(true)
            .match({ 'imageUri.full': { $exists: true } })
            .group({
                _id:   { set: '$set', lang: '$lang' },
                infos: {
                    $push: {
                        number: '$number',
                        layout: '$layout',
                        uri:    '$imageUri.full',
                    },
                },
            })
            .addFields({ langIsEn: { $eq: ['$_id.lang', 'en'] } })
            .sort({ 'langIsEn': -1, '_id.lang': 1 });

        const total = await Print.aggregate(aggregate.pipeline()).allowDiskUse(true).count('total');

        this.projCount = 0;
        this.failed = 0;
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

            this.projCount += 1;

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
                const name = info.number;
                this.todoTasks.push({
                    name,
                    uri:  info.uri,
                    path: cardImagePath(
                        'jpg',
                        this.set,
                        this.lang,
                        info.number,
                    ),
                });

                this.statusMap[name] = 'waiting';
            }

            this.total = this.todoTasks.length;

            const [exists, nonexist] = partition(this.todoTasks, task => FileSaver.fileExists(task.path));

            for (const task of exists) {
                this.statusMap[task.name] = 'exists';
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
