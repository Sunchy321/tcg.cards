import { ProgressHandler } from '@/common/progress';

import Card from '../db/scryfall/card';

import { IStatus } from './interface';

import { saveFile } from '@/common/save-file';
import { join } from 'path';

import { asset } from '@config';
import { existsSync, unlinkSync } from 'fs';

interface IImageProjection {
    _id: { set: string, lang:string },
    info: { number: string, uris: Record<string, string> }[]
}

interface IImageStatus {
    uris: Record<string, string>,
    status?: string
}

export class ImageGetter extends ProgressHandler<IStatus> {
    // progressId?: NodeJS.Timeout;

    async action(): Promise<void> {
        // let count = 0;

        const files = await Card.aggregate([
            { $group: { _id: '$file' } },
            { $sort: { _id: -1 } },
        ]);

        const lastFile = files[0]._id;

        const query = {
            image_uris: { $exists: true },
            file:       lastFile,
        };

        // const total = await Card.countDocuments(query);

        // const start = Date.now();

        // const postProgress = () => {
        //     const progress: IStatus = {
        //         method: 'get',
        //         type:   'image',

        //         amount: { total, count },
        //     };

        //     const elapsed = Date.now() - start;

        //     progress.time = {
        //         elapsed,
        //         remaining: elapsed / count * (total - count),
        //     };

        //     this.emitProgress(progress);
        // };

        // this.progressId = setInterval(postProgress, 500);

        const aggregate = Card.aggregate().match(query).group({
            _id:  { set: '$set_id', lang: '$lang' },
            info: { $push: { number: '$collector_number', uris: '$image_uris' } },
        }).allowDiskUse(true);

        for await (const proj of aggregate as unknown as AsyncGenerator<IImageProjection>) {
            await new Promise(resolve => {
                const { set, lang } = proj._id;

                let finished = 0;
                const total = proj.info.length;

                const status: Record<string, IImageStatus> = {};

                const print = () => {
                    const working = Object.keys(status).length;

                    process.stdout.write('\r' + ' '.repeat(80) + '\r');

                    process.stdout.write(`${set} ${lang} ${finished}:${working}:${total}`);

                    for (const n in status) {
                        process.stdout.write(' ' + n);
                    }
                };

                const finish = (n: string) => {
                    delete status[n];
                    ++finished;
                    print();
                    next();
                    if (Object.keys(status).length === 0) {
                        resolve();
                    }
                };

                const push = async (n: string, i: Record<string, string>) => {
                    status[n] = { uris: i };
                    print();

                    await Promise.all(
                        Object.entries(i).filter(v => v[0] === 'png').map(async ([type, uri]) => {
                            const ext = type === 'png' ? 'png' : 'jpg';
                            const path = join(asset, 'magic', 'card', type, set, lang, n + '.' + ext);

                            try {
                                await saveFile(uri, path);
                                finish(n);
                            } catch (e) {
                                if (existsSync(path)) {
                                    unlinkSync(path);
                                }

                                throw e;
                            }
                        }),
                    );

                    print();
                };

                const next = () => {
                    while (Object.keys(status).length < 10) {
                        const info = proj.info.shift();

                        if (info != null) {
                            push(info.number, info.uris);
                        } else {
                            break;
                        }
                    }
                };

                next();
            });

            console.log();
        }

        // if (this.progressId != null) {
        //     postProgress();
        //     clearInterval(this.progressId);
        //     this.progressId = undefined;
        // }
    }

    abort(): void {
        // TODO
    }

    equals(): boolean { return true; }
}
