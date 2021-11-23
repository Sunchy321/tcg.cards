import Task from '@/common/task';

import Entity from '../db/entity';
import { ICard, Locale } from '@interface/hearthstone/blizzard';

import blzApi from './api';
import Patch from '../db/patch';

import { assetPath } from '@static';
import FileSaver from '@/common/save-file';

const localeMap: Record<Locale, string> = {
    de_DE: 'de',
    en_US: 'en',
    es_ES: 'es',
    es_MX: 'mx',
    fr_FR: 'fr',
    it_IT: 'it',
    ja_JP: 'ja',
    pt_BR: 'pt',
    en_GB: 'en',
    pl_PL: 'pl',
    ru_RU: 'ru',
    ko_KR: 'ko',
    zh_CN: 'zhs',
    zh_TW: 'zht',
    th_TH: 'th',
};

interface ICardResponse {
    cards: ICard[];
    cardCount: number;
    pageCount: number;
    page: number;
}

interface IImageStatus {
    method: 'get';
    type: 'image';
    count: number;
    total: number;
}

interface IImageTask {
    name: string,
    uri: string,
    path: string
}

export class ImageGetter extends Task<IImageStatus> {
    todoTasks: IImageTask[] = [];

    taskMap: Record<string, [IImageTask, FileSaver]> = {};

    statusMap: Record<string, string> = {};

    async startImpl(): Promise<void> {
        let data: ICardResponse;
        let page = 1;

        let count = 0;
        let total = 0;

        this.intervalProgress(500, () => ({
            method: 'get',
            type:   'image',
            count,
            total,
        }));

        do {
            data = await blzApi('/hearthstone/cards', {
                collectible: '0,1',
                page,
                pageSize:    200,
            });

            total = data.cardCount;

            const patches = await Patch.find().sort({ number: -1 });

            const entities = await Entity.find({
                dbfId:   { $in: data.cards.map(c => c.id) },
                version: patches[0].number,
            });

            this.todoTasks = [];
            this.taskMap = {};
            this.statusMap = {};

            for (const c of data.cards) {
                if (this.status === 'idle') {
                    return;
                }

                const e = entities.find(e => e.dbfId === c.id);

                if (e == null) {
                    continue;
                }

                for (const l of Object.keys(c.image)) {
                    this.todoTasks.push({
                        name: `${e.cardId}/${l}: normal`,
                        uri:  c.image[l as Locale],
                        path: `${assetPath}/hearthstone/card/constructed/normal/${localeMap[l as Locale]}/${e.cardId}.png`,
                    });
                }

                for (const l of Object.keys(c.imageGold)) {
                    this.todoTasks.push({
                        name: `${e.cardId}/${l}: gold`,
                        uri:  c.imageGold[l as Locale],
                        path: `${assetPath}/hearthstone/card/constructed/gold/${localeMap[l as Locale]}/${e.cardId}.png`,
                    });
                }
            }

            await this.waitForTasks();

            count += data.cards.length;

            page += 1;
        } while (data.page < data.pageCount);

        page = 1;

        do {
            data = await blzApi('/hearthstone/cards', {
                collectible: '0,1',
                gameMode:    'battlegrounds',
                page,
                pageSize:    200,
            });

            count = 0;
            total = data.cardCount;

            const patches = await Patch.find().sort({ number: -1 });

            const entities = await Entity.find({
                dbfId:   { $in: data.cards.map(c => c.id) },
                version: patches[0].number,
            });

            this.todoTasks = [];
            this.taskMap = {};
            this.statusMap = {};

            for (const c of data.cards) {
                if (this.status === 'idle') {
                    return;
                }

                const e = entities.find(e => e.dbfId === c.id);

                if (e == null) {
                    continue;
                }

                if (c.battlegrounds != null) {
                    for (const l of Object.keys(c.battlegrounds.image)) {
                        this.todoTasks.push({
                            name: `${e.cardId}/${l}: bg-normal`,
                            uri:  c.battlegrounds.image[l as Locale],
                            path: `${assetPath}/hearthstone/card/battlegrounds/normal/${localeMap[l as Locale]}/${e.cardId}.png`,
                        });
                    }

                    for (const l of Object.keys(c.battlegrounds.imageGold)) {
                        this.todoTasks.push({
                            name: `${e.cardId}/${l}: bg-gold`,
                            uri:  c.battlegrounds.imageGold[l as Locale],
                            path: `${assetPath}/hearthstone/card/battlegrounds/gold/${localeMap[l as Locale]}/${e.cardId}.png`,
                        });
                    }
                }
            }

            await this.waitForTasks();

            count += data.cards.length;

            page += 1;
        } while (data.page < data.pageCount);
    }

    private rest() {
        return this.todoTasks.length;
    }

    private working() {
        return Object.keys(this.taskMap).length;
    }

    private async waitForTasks() {
        const promise = new Promise<void>((resolve, reject) => {
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
        while (this.working() < 10 && this.rest() > 0) {
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

                    for (const k of Object.keys(this.taskMap)) {
                        this.taskMap[k][1].stop();
                        this.statusMap[k] = 'aborted';
                    }

                    this.postIntervalProgress();
                    this.emit('error', err);
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
}
