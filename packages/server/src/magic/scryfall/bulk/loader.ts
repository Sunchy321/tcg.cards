/* eslint-disable @typescript-eslint/no-explicit-any */
import { ProgressHandler } from '@/common/progress';

import Card, { ICard } from '../../db/scryfall/card';
import Ruling, { IRuling } from '../../db/scryfall/ruling';

import { IStatus, RawCard, RawRuling } from '../interface';

import LineReader from '@/common/line-reader';
import toBucket from '@/common/to-bucket';
import { join } from 'path';
import { isEqual, partition } from 'lodash';

import { data } from '@config';
import { Document } from 'mongoose';

const bulkPath = join(data, 'magic/scryfall');

async function* convertJson<T>(gen: AsyncGenerator<string>): AsyncGenerator<T> {
    for await (const line of gen) {
        if (line === '[') {
            continue;
        } else if (line === ']') {
            return;
        }

        const json = JSON.parse(line.replace(/,$/, ''));

        yield json as T;
    }
}

const bucketSize = 500;

export default class BulkLoader extends ProgressHandler<IStatus> {
    type: 'card' | 'ruling';
    file: string;
    filePath: string;
    lineReader: LineReader;
    progressId?: NodeJS.Timeout;

    start?: number;
    count = 0;
    updated = 0;
    total = 0;

    constructor(fileName: string) {
        super();

        if (fileName.startsWith('all-cards')) {
            this.type = 'card';
        } else {
            this.type = 'ruling';
        }

        this.file = fileName;
        this.filePath = join(bulkPath, fileName + '.json');
        this.lineReader = new LineReader(this.filePath);
    }

    async action(): Promise<void> {
        const postProgress = () => {
            const progress: IStatus = {
                method: 'load',
                type:   this.type,

                amount: {
                    total: this.total,
                    count: this.count,
                },
            };

            if (this.type === 'card') {
                progress.amount.updated = this.updated;
            }

            if (this.start != null) {
                const elapsed = Date.now() - this.start;

                progress.time = {
                    elapsed,
                    remaining: elapsed / this.count * (this.total - this.count),
                };
            }

            this.emitProgress(progress);
        };

        this.progressId = setInterval(postProgress, 500);

        for await (const line of this.lineReader.get()) {
            if (line !== '[' && line !== ']') {
                ++this.total;
            }
        }

        this.lineReader.reset();

        this.start = Date.now();

        if (this.type === 'card') {
            for await (const jsons of toBucket(convertJson<RawCard>(this.lineReader.get()), bucketSize)) {
                await this.insertCards(jsons);
            }
        } else {
            await Ruling.deleteMany({ });

            for await (const jsons of toBucket(convertJson<RawRuling>(this.lineReader.get()), bucketSize)) {
                await this.insertRulings(jsons);
            }
        }

        if (this.progressId != null) {
            postProgress();
            clearInterval(this.progressId);
            this.progressId = undefined;
        }
    }

    private async insertCards(rawJsons: RawCard[]) {
        const jsons = rawJsons.map(
            ({ id, set, ...rest }) => ({ card_id: id, set_id: set, ...rest, file: this.file } as ICard),
        );

        const docs = await Card.find({ card_id: { $in: jsons.map(j => j.card_id) } });

        const updated = jsons.map(
            json => [json, docs.find(j => j.card_id === json.card_id)] as [ICard, ICard & Document],
        ).filter(([json, doc]) => {
            if (doc == null) {
                return true;
            }

            const oldJson = doc.toJSON();

            const unequalFields = Object.keys(oldJson).filter(k =>
                !k.startsWith('_') &&
                k !== 'file' &&
                !isEqual((oldJson as any)[k], (json as any)[k]),
            );

            if (unequalFields.length !== 0) {
                return true;
            }

            return false;
        });

        const [toInsert, toUpdate] = partition(updated, pair => pair[1] == null);

        await Card.insertMany(toInsert.map(pair => pair[0]));

        for (const [json, doc] of toUpdate) {
            await doc.replaceOne(json);
        }

        this.updated += updated.length;
        this.count += rawJsons.length;
    }

    private async insertRulings(rawJsons: RawRuling[]) {
        const jsons = rawJsons.map(
            rawJson => ({ ...rawJson, file: this.file } as IRuling),
        );

        await Ruling.insertMany(jsons);
    }

    abort(): void {
        this.lineReader.abort();

        if (this.progressId != null) {
            clearInterval(this.progressId);
            this.progressId = undefined;
        }
    }

    equals(file: string): boolean {
        return this.file === file;
    }
}
