import Task from '@/common/task';

import Entity from '@/hearthstone/db/entity';

import FileSaver from '@/common/save-file';

import { join } from 'path';
import { assetPath } from '@/config';

const imageUrlBase = 'https://art.hearthstonejson.com/v1/orig';

interface IImageProjection {
    _id: string;
}

interface IImageTask {
    name: string;
    uri: string;
    path: string;
}

interface IImageStatus {
    overall: { count: number, total: number };
    time: { elapsed: number, remaining: number };
    status: Record<string, string>;
    failed: number;
}

export class ImageGetter extends Task<IImageStatus> {
    type: string;
    exist = 0;
    count = 0;
    total: number;
    failed = 0;
    todoTasks: IImageTask[] = [];
    taskMap: Record<string, [IImageTask, FileSaver]> = {};
    statusMap: Record<string, string> = {};

    async startImpl(): Promise<void> {
        const aggregate = Entity.aggregate<IImageProjection>()
            .allowDiskUse(true)
            .match({ cardType: { $ne: 'enchantment' } })
            .unwind('version')
            .group({ _id: '$cardId', version: { $min: '$version' } })
            .sort({ version: 1 });

        const total = await Entity.aggregate(aggregate.pipeline()).allowDiskUse(true).count('total');

        this.total = total[0].total;
        this.exist = 0;
        this.count = 0;
        this.failed = 0;

        this.todoTasks = [];
        this.taskMap = {};
        this.statusMap = {};

        const start = Date.now();

        this.intervalProgress(500, function () {
            const elapsed = Date.now() - start;

            const time = {
                elapsed,
                remaining: (elapsed / this.count) * (this.total - this.count - this.exist),
            };

            return {
                overall: { count: this.count + this.exist, total: this.total },
                time,
                status:  this.statusMap,
                failed:  this.failed,
            };
        });

        for await (const proj of aggregate) {
            if (this.status === 'idle') {
                return;
            }

            const path = join(
                assetPath,
                'hearthstone',
                'card',
                'illustration',
                'png',
                `${proj._id}.png`,
            );

            if (FileSaver.fileExists(path)) {
                this.exist += 1;
                continue;
            }

            this.todoTasks.push({
                name: proj._id,
                uri:  `${imageUrlBase}/${proj._id}.png`,
                path,
            });
        }

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
        while (this.working() < 40 && this.rest() > 0) {
            const randomIndex = Math.floor(Math.random() * this.todoTasks.length);

            const task = this.todoTasks[randomIndex];

            this.todoTasks.splice(randomIndex, 1);

            if (task != null) {
                const savers = new FileSaver(task.uri, task.path);

                savers.on('end', () => {
                    this.count += 1;
                    delete this.taskMap[task.name];
                    delete this.statusMap[task.name];

                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }).on('error', () => {
                    this.failed += 1;
                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'failed';

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
