import { allModels, games } from '@model-data/index';

import * as fs from 'fs';

import { genTables } from './model/gen-table';
import { genFromTemplate } from './model/from-template';

for (const g of games) {
    const baseDir = `./src/${g}`;

    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir);
    }

    genFromTemplate(g, 'router.ts');
    genFromTemplate(g, 'schema/schema.ts');

    const model = allModels[g];

    genTables(g, model.card.card, 'card');
}
