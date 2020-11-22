import request from 'request-promise-native';

import FileSaver from '@/common/save-file';
import { existsSync, readdirSync } from 'fs';
import { last } from 'lodash';
import { join } from 'path';

import Task from '@/common/task';

import { IStatus } from '../interface';
import { IBulkData, IBulkList } from './interface';

import { data } from '@config';

const bulkPath = join(data, 'magic/scryfall');

export default class BulkSaver extends Task<IStatus> {
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

                await this.saver.waitForEnd();
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

                await this.saver.waitForEnd();
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
