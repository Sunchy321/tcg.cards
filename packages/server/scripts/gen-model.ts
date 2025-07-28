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

    if (model.card.card) {
        genTables(g, model.card.card, 'card');
    }

    if (model.print.print) {
        genTables(g, model.print.print, 'print');
    }
}
