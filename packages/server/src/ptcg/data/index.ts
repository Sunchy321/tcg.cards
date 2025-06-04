import Task from '@/common/task';

import Card from '@/ptcg/db/card';
import Print from '@/ptcg/db/print';
import Set from '@/ptcg/db/set';

import { Entry } from '@interface/ptcg/database/entry';
import { Card as ICard } from '@interface/ptcg/card';
import { Print as IPrint } from '@interface/ptcg/print';
import { WithUpdation } from '@common/model/updation';

import { Status } from '../status';

import { readFileSync } from 'fs';
import { join } from 'path';
import { omit, uniq } from 'lodash';
import internalData from '@/internal-data';
import { toBucket, toGenerator } from '@/common/to-bucket';
import { toCard } from './to-card';
import { combineCard, mergeCard, mergePrint } from './merge';

import { dataPath } from '@/config';
import { bulkUpdation } from '@/ptcg/logger';

const path = join(dataPath, 'ptcg', 'PTCG-database');

const bucketSize = 500;

export default class DataLoader extends Task<Status> {
    file:     string;
    filePath: string;

    async startImpl(): Promise<void> {
        bulkUpdation.info('=================== LOAD DATA ===================');

        const type = 'set';
        const total = 0;
        const count = 0;

        // start timer
        const start = Date.now();

        this.intervalProgress(500, () => {
            const prog: Status = {
                method: 'load',
                type,

                amount: { total, count },
            };

            const elapsed = Date.now() - start;

            prog.time = {
                elapsed,
                remaining: (elapsed / count) * (total - count),
            };

            return prog;
        });

        const data = JSON.parse(readFileSync(this.filePath).toString()) as Entry;

        const lang = data.lang;

        bulkUpdation.info('============== LOAD DATA COMPLETE ==============');
    }

    stopImpl(): void { /* no-op */ }
}
