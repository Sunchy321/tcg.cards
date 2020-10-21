/* eslint-disable @typescript-eslint/no-explicit-any */
import LineReader from '@/common/line-reader';
import ScryfallCard from '../../db/scryfall-card';
import ScryfallRuling from '../../db/scryfall-ruling';

import { join } from 'path';

import { IBulkStatus } from './interface';

import { data } from '@config';

const bulkPath = join(data, 'magic/scryfall');

const bucketSize = 1000;

export default class BulkLoader {
    type: 'all-card' | 'ruling';
    file: string;
    filePath: string;
    lineReader: LineReader;
    progress?: (progress: IBulkStatus) => void;

    constructor(fileName: string) {
        if (fileName.startsWith('all-cards')) {
            this.type = 'all-card';
        } else {
            this.type = 'ruling';
        }

        this.file = fileName;
        this.filePath = join(bulkPath, fileName + '.json');
        this.lineReader = new LineReader(this.filePath);
    }

    on(event: 'progress', callback: (progress: IBulkStatus) => void): void {
        this.progress = callback;
    }

    abort(): void {
        this.lineReader.abort();
    }

    async get(): Promise<void> {
        if (this.type === 'all-card') {
            await ScryfallCard.deleteMany({ });
        } else {
            await ScryfallRuling.deleteMany({ });
        }

        let count = 0;
        let total = 0;

        for await (const line of this.lineReader.get()) {
            if (line !== '[' && line !== ']') {
                ++total;

                if (this.progress != null && total % bucketSize === 0) {
                    this.progress({
                        method: 'load',
                        type:   this.type,
                        total,
                        count,
                    });
                }
            }
        }

        this.lineReader.reset();

        const jsons = [];

        for await (const line of this.lineReader.get()) {
            if (line === '[') {
                continue;
            } else if (line === ']') {
                break;
            }

            const json = JSON.parse(line.replace(/,$/, ''));

            jsons.push(json);

            if (jsons.length >= bucketSize) {
                await insertMany(jsons, this.type);
                count += jsons.length;

                if (this.progress != null) {
                    this.progress({
                        method: 'load',
                        type:   this.type,
                        total,
                        count,
                    });
                }

                jsons.splice(0, jsons.length);
            }
        }

        if (jsons.length !== 0) {
            await insertMany(jsons, this.type);
            count += jsons.length;

            if (this.progress != null) {
                this.progress({
                    method: 'load',
                    type:   this.type,
                    total,
                    count,
                });
            }
        }
    }
}

async function insertMany(jsons: any[], type: 'all-card' | 'ruling') {
    if (type === 'all-card') {
        for (const j of jsons) {
            j.card_id = j.id;
            j.set_id = j.set;

            delete j.id;
            delete j.set;
        }

        return ScryfallCard.insertMany(jsons);
    } else {
        return ScryfallRuling.insertMany(jsons);
    }
}
