import { Game, allModels, games } from '@model-data/index';

import * as fs from 'fs';

import ts, { factory as f } from 'typescript';
import { z } from 'zod';

import { findDrizzleTables } from './model/gen-table';
import { genFromTemplate } from './model/from-template';

for (const g of games) {
    const baseDir = `./src/${g}`;

    if (!fs.existsSync(baseDir)) {
        fs.mkdirSync(baseDir);
    }

    genFromTemplate(g, 'router.ts');
    genFromTemplate(g, 'schema/schema.ts');

    const model = allModels[g];

    genTable(g, model.card.card, 'card');
}

function genTable(g: Game, model: z.ZodType<any>, name: string) {
    const tables = findDrizzleTables('card', model);

    const tableDecls = [];
    const allImports = [];

    // for (const t of tables) {
    //     const [name, model] = t;

    //     const [table, imports] = createDrizzleTable(name, model);

    //     tableDecls.push(table);
    //     allImports.push(...imports);
    // }

    const statements = [];

    statements.push(
        f.createImportDeclaration(
            undefined,
            f.createImportClause(
                false,
                undefined,
                f.createNamedImports(
                    [
                        f.createImportSpecifier(
                            false,
                            undefined,
                            f.createIdentifier('schema'),
                        ),
                    ],
                ),
            ),
            f.createStringLiteral('./schema'),
        ),
    );

    const sourceFile = f.createSourceFile(
        statements,
        f.createToken(ts.SyntaxKind.EndOfFileToken),
        ts.NodeFlags.None,
    );

    const path = `./src/${g}/schema/${name}.ts`;

    const resultFile = ts.createSourceFile(
        path,
        '',
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
    );

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

    const result = printer.printNode(ts.EmitHint.SourceFile, sourceFile, resultFile);

    const dir = path.substring(0, path.lastIndexOf('/'));

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(path, result);
}
