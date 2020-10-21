import request from 'request-promise-native';

import FileSaver from '@/common/save-file';
import { existsSync, readdirSync } from 'fs';
import { last } from 'lodash';
import { join } from 'path';

import { IBulkData, IBulkList, IBulkStatus } from './interface';

import { data } from '@config';

const bulkPath = join(data, 'magic/scryfall');

export default class BulkSaver {
    progress?: (progress: IBulkStatus) => void;
    saver?: FileSaver;

    on(event: 'progress', callback: (progress: IBulkStatus) => void): void {
        this.progress = callback;
    }

    abort(): void {
        if (this.saver != null) {
            this.saver.abort();
        }
    }

    async get(): Promise<void> {
        {
            const info: IBulkData = JSON.parse(await request('https://api.scryfall.com/bulk-data/all-cards'));
            const uri = info.download_uri;
            const filename = last(uri.split('/'));

            if (filename != null) {
                const path = join(bulkPath, filename);

                this.saver = new FileSaver(uri, path, { override: true });

                this.saver.on('progress', progress => {
                    if (this.progress != null) {
                        this.progress({
                            method: 'get',
                            type:   'all-card',
                            count:  progress.size.transferred,
                        });
                    }
                });

                await this.saver.save();
            }
        }

        {
            const info: IBulkData = JSON.parse(await request('https://api.scryfall.com/bulk-data/rulings'));
            const uri = info.download_uri;
            const filename = last(uri.split('/'));

            if (filename != null) {
                const path = join(bulkPath, filename);

                this.saver = new FileSaver(uri, path, { override: true });

                this.saver.on('progress', progress => {
                    if (this.progress != null) {
                        this.progress({
                            method: 'get',
                            type:   'ruling',
                            count:  progress.size.transferred,
                        });
                    }
                });

                await this.saver.save();
            }
        }
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

export class BulkLoader {
    file: string;
    progress?: (progress: IBulkStatus) => void;
    aborted = false;

    constructor(file: string) {
        this.file = file;
    }

    on(event: 'progress', callback: (progress: IBulkStatus) => void): void {
        this.progress = callback;
    }

    abort(): void {
        this.aborted = true;
    }

    async get(): Promise<void> {
        // TODO
    }
}
