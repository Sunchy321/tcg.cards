/* eslint-disable @typescript-eslint/no-explicit-any */
import LineReader from '@/common/line-reader';
import Card from '../../db/scryfall/card';
import Ruling from '../../db/scryfall/ruling';

import { join } from 'path';

import { IBulkStatus } from './interface';

import { data } from '@config';
import { ProgressHandler } from '@/common/progress';

const bulkPath = join(data, 'magic/scryfall');

const bucketSize = 1000;

export default class BulkLoader extends ProgressHandler<IBulkStatus> {
    type: 'all-card' | 'ruling';
    file: string;
    filePath: string;
    lineReader: LineReader;

    constructor(fileName: string) {
        super();

        if (fileName.startsWith('all-cards')) {
            this.type = 'all-card';
        } else {
            this.type = 'ruling';
        }

        this.file = fileName;
        this.filePath = join(bulkPath, fileName + '.json');
        this.lineReader = new LineReader(this.filePath);
    }

    async action(): Promise<void> {
        if (this.type === 'all-card') {
            await Card.deleteMany({ });
        } else {
            await Ruling.deleteMany({ });
        }

        let count = 0;
        let total = 0;

        for await (const line of this.lineReader.get()) {
            if (line !== '[' && line !== ']') {
                ++total;

                if (total % bucketSize === 0) {
                    this.emitProgress({
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

                this.emitProgress({
                    method: 'load',
                    type:   this.type,
                    total,
                    count,
                });

                jsons.splice(0, jsons.length);
            }
        }

        if (jsons.length !== 0) {
            await insertMany(jsons, this.type);
            count += jsons.length;

            this.emitProgress({
                method: 'load',
                type:   this.type,
                total,
                count,
            });
        }
    }

    abort(): void {
        this.lineReader.abort();
    }

    equals(file: string): boolean {
        return this.file === file;
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

        return Card.insertMany(jsons);
    } else {
        return Ruling.insertMany(jsons);
    }
}
