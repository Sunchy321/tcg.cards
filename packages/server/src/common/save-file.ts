import * as fs from 'fs';
import * as request from 'request-promise-native';
import * as download from 'download';

import logger from '../logger';

export class ISaveFileOption {
    public override?: boolean;
}

export default async function saveFile(url: string, path: string, option: ISaveFileOption = { }) {
    const fileInfo = `${url} -> ${path}`;

    const override = option.override || false;

    const dir = path.split('/').slice(0, -1).join('/');

    if (fs.existsSync(dir + '/.no-auto-save')) {
        logger.info(fileInfo + ': skipped', { category: 'file' });
        return;
    }

    if (fs.existsSync(path) && !override) {
        logger.info(fileInfo + ': exists', { category: 'file' });
        return;
    }

    logger.info(fileInfo + ': start', { category: 'file' });

    download(url, dir);

    // download(url).pipe(fs.createWriteStream(path));

    logger.info(fileInfo + ': end', { category: 'file' });
}