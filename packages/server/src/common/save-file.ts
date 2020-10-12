import * as fs from 'fs';
import * as download from 'download';

import * as logger from '../logger';

interface ISaveFileOption {
    override?: boolean;
}

export default async function saveFile(
    url: string,
    path: string,
    option: ISaveFileOption = {},
) {
    const fileInfo = `${url} -> ${path}`;

    const override = option.override || false;

    const dir = path.split('/').slice(0, -1).join('/');

    if (fs.existsSync(dir + '/.no-auto-save')) {
        logger.main.info(fileInfo + ': skipped', { category: 'file' });
        return;
    }

    if (fs.existsSync(path) && !override) {
        logger.main.info(fileInfo + ': exists', { category: 'file' });
        return;
    }

    logger.main.info(fileInfo + ': start', { category: 'file' });

    await download(url, dir);

    logger.main.info(fileInfo + ': end', { category: 'file' });
}
