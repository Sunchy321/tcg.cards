import request from 'request-promise-native';

import FileSaver from '@/common/save-file';
import { existsSync, readdirSync } from 'fs';
import { last } from 'lodash';
import { join } from 'path';

import { ProgressHandler } from '@/common/progress';

import { IBulkData, IBulkList, IBulkStatus } from './interface';

import { data } from '@config';

const bulkPath = join(data, 'magic/scryfall');

export default class BulkSaver extends ProgressHandler<IBulkStatus> {
    saver?: FileSaver;

    async action(): Promise<void> {
        {
            const info: IBulkData = JSON.parse(await request('https://api.scryfall.com/bulk-data/all-cards'));
            const uri = info.download_uri;
            const filename = last(uri.split('/'));

            if (filename != null) {
                const path = join(bulkPath, filename);

                this.saver = new FileSaver(uri, path, { override: true });

                this.saver.onProgress(progress => {
                    this.emitProgress({
                        method: 'get',
                        type:   'all-card',
                        count:  progress.size.transferred,
                    });
                });

                await this.saver.exec();
            }
        }

        {
            const info: IBulkData = JSON.parse(await request('https://api.scryfall.com/bulk-data/rulings'));
            const uri = info.download_uri;
            const filename = last(uri.split('/'));

            if (filename != null) {
                const path = join(bulkPath, filename);

                this.saver = new FileSaver(uri, path, { override: true });

                this.saver.onProgress(progress => {
                    this.emitProgress({
                        method: 'get',
                        type:   'ruling',
                        count:  progress.size.transferred,
                    });
                });

                await this.saver.exec();
            }
        }
    }

    abort(): void {
        if (this.saver != null) {
            this.saver.abort();
        }
    }

    equals(): boolean {
        return true;
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
