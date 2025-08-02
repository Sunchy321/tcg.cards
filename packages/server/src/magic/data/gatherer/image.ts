import Task from '@/common/task';

import { db } from '@/drizzle';
import { Print } from '@/magic/schema/print';

import FileSaver from '@/common/save-file';

import { eq } from 'drizzle-orm';
import _ from 'lodash';
import axios from 'axios';
import cheerio from 'cheerio';

import { cardImagePath } from '@/magic/image';

interface IImageTask {
    name:         string;
    multiverseId: number;
    path:         string;
}

interface IImageStatus {
    method: string;
    type:   string;

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
        const prints = await db.select({
            set:          Print.set,
            number:       Print.number,
            lang:         Print.lang,
            multiverseId: Print.multiverseId,
        })
            .from(Print)
            .where(eq(Print.set, this.set));

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
                method: 'get',
                type:   'image',
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
                    name:         `${p.number}:${p.lang}`,
                    multiverseId: p.multiverseId[0],
                    path:         cardImagePath('large', p.set, p.lang, p.number),
                });
            } else if (p.multiverseId.length === 2) {
                this.todoTasks.push({
                    name:         `${p.number}:${p.lang}-0`,
                    multiverseId: p.multiverseId[0],
                    path:         cardImagePath('large', p.set, p.lang, p.number, 0),
                });

                this.todoTasks.push({
                    name:         `${p.number}:${p.lang}-1`,
                    multiverseId: p.multiverseId[1],
                    path:         cardImagePath('large', p.set, p.lang, p.number, 1),
                });
            } else {
                console.warn(`Invalid multiverseId length for ${p.set} ${p.number} (${p.lang}): ${p.multiverseId.length}`);
                continue;
            }
        }

        const [exists, nonexist] = _.partition(this.todoTasks, task => FileSaver.fileExists(task.path));

        for (const task of nonexist) {
            this.statusMap[task.name] = 'waiting';
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

    private async pushTask() {
        while (this.working() < 20 && this.rest() > 0) {
            const randomIndex = Math.floor(Math.random() * this.todoTasks.length);

            const task = this.todoTasks[randomIndex];

            this.todoTasks.splice(randomIndex, 1);

            if (task != null) {
                const url = `https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${task.multiverseId}&printed=true`;

                const html = await axios.get(url);

                const $ = cheerio.load(html.data);

                const imageUrl = $('[data-testid=cardFrontImage]').attr('src')!;

                const savers = new FileSaver(imageUrl, task.path, {
                    axiosOption: {
                        timeout: 5000,
                    },
                });

                savers.on('end', () => {
                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'success';

                    this.count += 1;

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
