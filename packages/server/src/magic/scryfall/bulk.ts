import request from 'request-promise-native';
import { BulkData, BulkList, BulkProgress } from './interface';

import saveFile from '@/common/save-file';
import { existsSync, readdirSync } from 'fs';
import { last } from 'lodash';
import { join } from 'path';

import { data } from '@config';

const bulkPath = join(data, 'magic/scryfall');

export async function getBulk(callback: (progress: BulkProgress) => void): Promise<void> {
    {
        const info: BulkData = await request('https://api.scryfall.com/all-cards');
        const uri = info.download_uri;
        const filename = last(uri.split('/'));

        if (filename != null) {
            const path = join(bulkPath, filename);

            await saveFile(uri, path, {}, progress => {
                callback({ type: 'all-card', ...progress });
            });
        }
    }

    {
        const info: BulkData = await request('https://api.scryfall.com/rulings');
        const uri = info.download_uri;
        const filename = last(uri.split('/'));

        if (filename != null) {
            const path = join(bulkPath, filename);

            await saveFile(uri, path, {}, progress => {
                callback({ type: 'ruling', ...progress });
            });
        }
    }
}

export function bulkData(): BulkList {
    if (!existsSync(bulkPath)) {
        return { allCard: [], ruling: [] };
    }

    const content = readdirSync(bulkPath);

    return {
        allCard: content.filter(v => v.startsWith('all-cards')).map(v => v.slice(0, -5)),
        ruling:  content.filter(v => v.startsWith('rulings')).map(v => v.slice(0, -5)),
    };
}
