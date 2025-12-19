import Task from '@/common/task';

import { db } from '@/drizzle';
import { Print } from '@/magic/schema/print';

import FileSaver from '@/common/save-file';

import { ImageTaskStatus } from '@model/magic/schema/data/gatherer/image';

import { and, eq } from 'drizzle-orm';
import _ from 'lodash';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { unlinkSync } from 'fs';

import { cardImagePath } from '@/magic/image';
import { Locale } from '@model/magic/schema/basic';

interface IImageTask {
    name:         string;
    cardId:       string;
    set:          string;
    number:       string;
    lang:         Locale;
    multiverseId: number;
    partIndex:    number | undefined;
    exists:       boolean;
}

const PARALLEL_TASKS = 50;

export async function saveGathererImage(mids: number[], set: string, number: string, lang: string): Promise<void> {
    if (mids.length === 1) {
        const saver = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number, undefined, 'webp'),
        );

        saver.start();

        await saver.waitForEnd();
    } else {
        const saverFront = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[0]}&type=card`,
            cardImagePath('large', set, lang, number, 0, 'webp'),
        );

        const saverBack = new FileSaver(
            `https://gatherer.wizards.com/Handlers/Image.ashx?multiverseid=${mids[1]}&type=card`,
            cardImagePath('large', set, lang, number, 1, 'webp'),
        );

        saverFront.start();
        saverBack.start();

        await Promise.all([saverFront.waitForEnd(), saverBack.waitForEnd()]);
    }
}

export class GathererImageTask extends Task<ImageTaskStatus> {
    set:       string;
    count = 0;
    total = 0;
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
            cardId:       Print.cardId,
            set:          Print.set,
            number:       Print.number,
            lang:         Print.lang,
            multiverseId: Print.multiverseId,
        })
            .from(Print)
            .where(eq(Print.set, this.set));

        this.count = 0;
        this.total = prints.reduce((prev, p) => prev + p.multiverseId.length, 0);

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

            const addTodoTask = (name: string, multiverseId: number, partIndex: number | undefined) => {
                const path = cardImagePath('large', p.set, p.lang, p.number, partIndex, 'webp');

                this.todoTasks.push({
                    name,
                    cardId: p.cardId,
                    set:    p.set,
                    number: p.number,
                    lang:   p.lang,
                    multiverseId,
                    partIndex,
                    exists: FileSaver.fileExists(path, [], true),
                });
            };

            if (p.multiverseId.length === 1) {
                addTodoTask(`${p.number}:${p.lang}`, p.multiverseId[0], undefined);
            } else if (p.multiverseId.length === 2) {
                addTodoTask(`${p.number}:${p.lang}-0`, p.multiverseId[0], 0);
                addTodoTask(`${p.number}:${p.lang}-1`, p.multiverseId[1], 1);
            } else {
                console.warn(`Invalid multiverseId length for ${p.set} ${p.number} (${p.lang}): ${p.multiverseId.length}`);
                continue;
            }
        }

        const [exists, nonexist] = _.partition(this.todoTasks, task => task.exists);

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
        while (this.working() < PARALLEL_TASKS && this.rest() > 0) {
            const randomIndex = Math.floor(Math.random() * this.todoTasks.length);

            const task = this.todoTasks[randomIndex];

            this.todoTasks.splice(randomIndex, 1);

            if (task != null) {
                try {
                    const url = `https://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid=${task.multiverseId}&printed=true`;

                    const html = await axios.get(url);

                    const $ = cheerio.load(html.data);

                    const imageUrl = $('[data-testid=cardFrontImage]').attr('src')!;

                    const extension = _.last(imageUrl.split('.'));

                    if (extension != 'webp') {
                        console.warn(`Invalid image extension for ${task.name}: ${extension}`);
                        delete this.taskMap[task.name];
                        this.statusMap[task.name] = 'failed';
                        this.failed += 1;
                        this.count += 1;
                        this.pushTask();

                        if (this.rest() === 0 && this.working() === 0) {
                            this.emit('all-end');
                        }

                        continue;
                    }

                    const path = cardImagePath('large', task.set, task.lang, task.number, task.partIndex, 'webp');

                    const savers = new FileSaver(imageUrl, path, {
                        axiosOption: {
                            timeout: 5000,
                        },
                    });

                    savers.on('end', async () => {
                        try {
                            await db.update(Print)
                                .set({ fullImageType: 'webp' })
                                .where(and(
                                    eq(Print.cardId, task.cardId),
                                    eq(Print.set, task.set),
                                    eq(Print.number, task.number),
                                    eq(Print.lang, task.lang),
                                ));

                            const jpgPath = cardImagePath('large', task.set, task.lang, task.number, task.partIndex, 'jpg');

                            if (FileSaver.fileExists(jpgPath)) {
                                unlinkSync(jpgPath);
                            };

                            delete this.taskMap[task.name];
                            this.statusMap[task.name] = 'success';
                        } catch (err) {
                            console.error(`Failed to update print for ${task.name}:`, err);

                            delete this.taskMap[task.name];
                            this.statusMap[task.name] = 'failed';
                            this.failed += 1;
                        }

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
                } catch (_err) {
                    console.error(`Failed to fetch image for ${task.name}`);

                    delete this.taskMap[task.name];
                    this.statusMap[task.name] = 'failed';
                    this.failed += 1;
                    this.count += 1;

                    this.pushTask();

                    if (this.rest() === 0 && this.working() === 0) {
                        this.emit('all-end');
                    }
                }
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
