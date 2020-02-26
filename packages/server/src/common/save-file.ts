import * as fs from 'fs';
import * as request from 'request-promise-native';

import logger from './logger';

export class ISaveFileOption {
    public override?: boolean;
}

export default async function saveFile(url: string, path: string, option: ISaveFileOption = { }): Promise<boolean> {
    const fileInfo = `${url} -> ${path}`;

    const override = option.override || false;

    logger.info(fileInfo, { category: 'file' });

    return new Promise<boolean>((resolve, reject) => {
        try {
            const dir = path.split('/').slice(0, -1).join('/');

            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            if (fs.existsSync(dir + '/.no-auto-save')) {
                resolve(false);
            } else if (fs.existsSync(path) && !override) {
                logger.info(fileInfo + ': file exists', { category: 'file' });
                resolve(true);
            } else {
                request.head(url, (e, r, b: string) => {
                    if (r != null && r.statusCode === 200) {
                        const req = request(url);

                        req.on('response', res => {
                            let progress = 0;

                            res.setEncoding('binary');

                            logger.info(
                                fileInfo + ': total size=' + res.headers['content-length'],
                                { category: 'file' },
                            );

                            fs.writeFileSync(path, '', 'binary');

                            const intervalId = setInterval(() => {
                                logger.info(
                                    `${fileInfo}: size=${
                                        (progress / 1024 / 1024).toFixed(2)
                                    }MiB`,
                                    { category: 'file' },
                                );
                            }, 1000);

                            res.on('data', chunk => {
                                progress += chunk.length;

                                fs.appendFileSync(path, chunk, 'binary');
                            });

                            res.on('close', () => {
                                logger.info(
                                    fileInfo + ': finish',
                                    { category: 'file' },
                                );

                                clearInterval(intervalId);

                                resolve(true);
                            });
                        });

                        //     .pipe(fs.createWriteStream(path))
                        //     .on('data', () => {
                        //         console.log(`Get data for ${url} -> ${path}`);
                        //     })
                        //     .on('close', () => {
                        //         logger.info(`Download ${url} -> ${path}: download finished`, { category: 'FILE' });
                        //         resolve(true);
                        //     });
                    } else {
                        reject(false);
                    }
                });
            }
        } catch {
            reject(false);
        }
    });
}
