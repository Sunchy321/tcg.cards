import Task from '@/common/task';

import { db } from '@/drizzle';
import { Print } from '@/magic/schema/print';
import { Set } from '@/magic/schema/set';
import { asc, sql } from 'drizzle-orm';

import FileSaver from '@/common/save-file';

import { ImageTaskStatus } from '@model/magic/schema/data/scryfall/image';

import { and, eq, gt, inArray, isNotNull, or } from 'drizzle-orm';

import { partition } from 'lodash';
import { cardImagePath } from '@/magic/image';

interface ImageProjection {
    set:   string;
    lang:  string;
    infos: { number: string, layout: string, uris: Record<string, string>[] }[];
}

interface ImageTask {
    name: string;
    uri:  string;
    path: string;
}

export class ImageGetter extends Task<ImageTaskStatus> {
    type:      string;
    set = '';
    lang = '';
    projCount = 0;
    projTotal = 0;
    total = 0;
    failed = 0;
    todoTasks: ImageTask[] = [];
    taskMap:   Record<string, [ImageTask, FileSaver]> = {};
    statusMap: Record<string, string> = {};

    constructor(type: string) {
        super();

        this.type = type;
    }

    async startImpl(): Promise<void> {
        const setCodeMap: Record<string, string> = {};

        const sets = await db.select()
            .from(Set);

        for (const set of sets) {
            if (set.setId !== set.scryfallCode) {
                setCodeMap[set.scryfallCode] = set.setId;
            }
        }

        const prints = await db
            .select({
                set:    Print.set,
                lang:   Print.lang,
                number: Print.number,
                layout: Print.layout,
                uris:   Print.scryfallImageUris,
            })
            .from(Print)
            .where(
                and(
                    isNotNull(Print.scryfallImageUris),
                    gt(sql`jsonb_array_length(${Print.scryfallImageUris})`, 0),
                    or(
                        inArray(Print.imageStatus, ['lowres', 'highres_scan']),
                        and(
                            eq(Print.lang, 'en'),
                            eq(Print.imageStatus, 'placeholder'),
                        ),
                    ),
                ),
            )
            .orderBy(
                sql`CASE WHEN ${Print.lang} = 'en' THEN 0 ELSE 1 END`,
                asc(Print.lang),
            );

        const groupedData = new Map<string, ImageProjection>();

        for (const print of prints) {
            const key = `${print.set}:${print.lang}`;
            if (!groupedData.has(key)) {
                groupedData.set(key, {
                    set:   print.set,
                    lang:  print.lang,
                    infos: [],
                });
            }

            groupedData.get(key)!.infos.push({
                number: print.number,
                layout: print.layout,
                uris:   print.uris || [],
            });
        }

        const sortedGroups = Array.from(groupedData.values()).sort((a, b) => {
            if (a.lang === 'en' && b.lang !== 'en') return -1;
            if (a.lang !== 'en' && b.lang === 'en') return 1;
            return a.lang.localeCompare(b.lang);
        });

        const total = sortedGroups.length;

        this.projCount = 0;
        this.projTotal = total;

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

        for (const proj of sortedGroups) {
            if (this.status === 'idle') {
                return;
            }

            this.projCount += 1;

            this.set = setCodeMap[proj.set] ?? proj.set;
            this.lang = proj.lang;

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
                if ([
                    'transform',
                    'modal_dfc',
                    'transform_token',
                    'reversible_card',
                    'double_faced',
                    'battle',
                ].includes(info.layout)) {
                    for (let i = 0; i < info.uris.length; i += 1) {
                        const name = `${info.number}-${i}`;

                        this.todoTasks.push({
                            name,
                            uri:  info.uris[i][this.type],
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
                } else {
                    const name = info.number;
                    this.todoTasks.push({
                        name,
                        uri:  info.uris[0][this.type],
                        path: cardImagePath(
                            this.type,
                            this.set,
                            this.lang,
                            info.number,
                        ),
                    });

                    this.statusMap[name] = 'waiting';
                }
            }

            this.total = this.todoTasks.length;

            const [exists, nonexist] = partition(this.todoTasks, task => FileSaver.fileExists(task.path, ['webp']));

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
