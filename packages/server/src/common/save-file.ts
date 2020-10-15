import fs from 'fs';
import request from 'request';
import progress, { Progress } from 'request-progress';

import * as logger from '../logger';

interface ISaveFileOption {
    override?: boolean;
}

export default async function saveFile(
    url: string,
    path: string,
    option: ISaveFileOption = {},
    callback?: (progress: Progress) => void,
): Promise<void> {
    const fileInfo = `${url} -> ${path}`;

    const override = option.override || false;

    const dir = path.split('/').slice(0, -1).join('/');

    if (fs.existsSync(dir + '/.no-auto-save')) {
        logger.main.info(`${fileInfo}: skipped`, { category: 'file' });
        return;
    }

    if (fs.existsSync(path) && !override) {
        logger.main.info(`${fileInfo}: exists`, { category: 'file' });
        return;
    }

    await new Promise((resolve, reject) => {
        const p = progress(request(url));

        if (callback != null) {
            p.on('progress', callback);
        }

        p.on('error', reject)
            .on('end', resolve)
            .pipe(fs.createWriteStream(path));
    });

    logger.main.info(`${fileInfo}: downloaded`, { category: 'file' });
}
