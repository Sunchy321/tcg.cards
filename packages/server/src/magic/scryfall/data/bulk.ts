import request from 'request-promise-native';

import FileSaver from '@/common/save-file';
import { existsSync, readdirSync } from 'fs';
import { last } from 'lodash';
import { join } from 'path';

import Task from '@/common/task';

import { IBulkData } from '@interface/magic/scryfall/bulk';

import { Status } from '../status';

import { dataPath } from '@/config';

interface IBulkList {
    allCard: string[];
    ruling: string[];
}

const bulkPath = join(dataPath, 'magic/scryfall');

export default class BulkGetter extends Task<Status> {
    saver?: FileSaver;

    async startImpl(): Promise<void> {
        {
            const info: IBulkData = JSON.parse(await request('https://api.scryfall.com/bulk-data/all-cards'));
            const uri = info.download_uri;
            const filename = last(uri.split('/'));

            if (filename != null) {
                const path = join(bulkPath, filename);

                this.saver = new FileSaver(uri, path, { override: true });

                this.saver.on('progress', prog => {
                    this.emit('progress', {
                        method: 'get',
                        type:   'card',

                        amount: {
                            count: prog.size.transferred,
                        },
                    });
                });

                await this.saver.start();
            }
        }

        {
            const info: IBulkData = JSON.parse(await request('https://api.scryfall.com/bulk-data/rulings'));
            const uri = info.download_uri;
            const filename = last(uri.split('/'));

            if (filename != null) {
                const path = join(bulkPath, filename);

                this.saver = new FileSaver(uri, path, { override: true });

                this.saver.on('progress', prog => {
                    this.emit('progress', {
                        method: 'get',
                        type:   'ruling',

                        amount: {
                            count: prog.size.transferred,
                        },
                    });
                });

                await this.saver.start();
            }
        }
    }

    stopImpl(): void {
        this.saver?.stop();
    }

    static data(): IBulkList {
        if (!existsSync(bulkPath)) {
            return { allCard: [], ruling: [] };
        }

        const content = readdirSync(bulkPath);

        return {
            allCard: content.filter(v => v.startsWith('all-cards')).map(v => v.slice(0, -5)),
            ruling:  content.filter(v => v.startsWith('rulings')).map(v => v.slice(0, -5)),
        };
    }
}
