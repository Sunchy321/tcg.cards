import { Game } from '@model-data/index';

import { z } from 'zod';
import ts, { factory as f } from 'typescript';
import * as fs from 'fs';
import _ from 'lodash';
import pascalcase from 'pascalcase';
import plur from 'plur';

export function genTables(g: Game, model: z.ZodType, name: string) {
    console.log(`Gen file ${g}/schema/${name}.ts`);

    if (!(model instanceof z.ZodObject)) {
        throw new Error(`Model ${name} is not a ZodObject.`);
    }

    const tables = findDrizzleTables('card', model);

    const tableDecls = [];
    const allImports = [];

    const foreignKeys: Record<string, z.ZodType> = {};

    const shape = model.shape as Record<string, z.ZodType>;

    for (const [key, subModel] of Object.entries(shape)) {
        if (subModel.getMeta()?.foreign || subModel.getMeta()?.primary) {
            foreignKeys[key] = subModel;
        }
    }

    for (const t of tables) {
        const [name, model] = t;

        const [table, imports] = createDrizzleTable(name, model, foreignKeys);

        tableDecls.push(table);
        allImports.push(...imports);
    }

    const statements: ts.Statement[] = [];

    statements.push(
        f.createImportDeclaration(
            undefined,
            f.createImportClause(
                false,
                undefined,
                f.createNamedImports(
                    _.uniq([...allImports, 'primaryKey']).sort().map(imp => f.createImportSpecifier(
                        false,
                        undefined,
                        f.createIdentifier(imp),
                    )),
                ),
            ),
            f.createStringLiteral('drizzle-orm/pg-core', true),
        ),
    );

    statements.push(f.createIdentifier('\n') as any);

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
            f.createStringLiteral('./schema', true),
        ),
    );

    statements.push(f.createIdentifier('\n') as any);

    for (const decl of tableDecls) {
        statements.push(decl);
        statements.push(f.createIdentifier('\n') as any);
    }

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

export function findDrizzleTables(name: string, model: z.ZodType): [string, z.ZodType][] {
    const result: [string, any][] = [];

    if (model instanceof z.ZodObject) {
        result.push([name, model]);

        const shape = model.shape as Record<any, z.ZodType>;

        for (const [key, subModel] of Object.entries(shape)) {
            if (subModel.getMeta()?.primaryKey != null) {
                result.push([`${name}_${key}`, subModel]);
            }

            if (subModel instanceof z.ZodArray) {
                const elementType = subModel.element;
                result.push(...findDrizzleTables(`${name}_${key}`, elementType));
            }

            if (subModel instanceof z.ZodObject) {
                const nestedTables = findDrizzleTables(`${name}_${key}`, subModel);
                // Only add nested tables that are not already in the result
                for (const nestedTable of nestedTables) {
                    if (!result.some(([tableName]) => tableName === nestedTable[0])) {
                        result.push(nestedTable);
                    }
                }
            }
        }
    }

    return result;
}

function createDrizzleTable<T>(
    name: string,
    model: z.ZodType<T>,
    foreignKeys: Record<string, z.ZodType>,
): [ts.Statement, string[]] {
    console.log(`Gen model ${name}`);

    const meta = model.getMeta() ?? {};

    if (meta.primaryKey == null) {
        throw new Error(`Model ${name} does not have a primary key defined.`);
    }

    if (!(model instanceof z.ZodObject)) {
        throw new Error(`Model ${name} is not a ZodObject.`);
    }

    const shape = model.shape as Record<string, z.ZodType>;

    const entries = Object.entries(shape)
        .filter(([_k, v]) => {
            const meta = v.getMeta() ?? {};

            if (meta.foreign) {
                return false;
            }

            if (meta.primary) {
                return false;
            }

            if (meta.primaryKey != null) {
                return false;
            }

            return true;
        });

    const primaryKeys: [string, z.ZodType][] = [];

    for (const p of model.getMeta()?.primaryKey ?? []) {
        primaryKeys.push([p, foreignKeys[p]]);
    }

    entries.unshift(...primaryKeys);

    const definitions = entries.map(([k, v]) => {
        if (v instanceof z.ZodOptional) {
            const [decl, imports] = createTableKeyDefinition(v.unwrap(), k);

            return [k, decl, imports] as const;
        }

        const [decl, imports] = createTableKeyDefinition(v, k);

        if (v instanceof z.ZodEnum) {
            return [k, decl, imports] as const;
        }

        const notNullDecl = f.createCallExpression(
            f.createPropertyAccessExpression(decl, 'notNull'),
            undefined,
            [],
        );

        return [k, notNullDecl, imports] as const;
    });

    const tableDefinition = f.createObjectLiteralExpression(
        definitions.map(([k, m]) => f.createPropertyAssignment(
            f.createIdentifier(k),
            m,
        )),
        true,
    );

    const imports = _.uniq(definitions.map(d => d[2]).flat());

    const primaryKeyExprList = primaryKeys
        .map(([k]) => f.createPropertyAccessExpression(
            f.createIdentifier('table'),
            f.createIdentifier(k),
        ));

    const configExpr = f.createArrowFunction(
        undefined,
        undefined,
        [f.createParameterDeclaration(
            undefined,
            undefined,
            f.createIdentifier('table'),
            undefined,
            undefined,
            undefined,
        )],
        undefined,
        f.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
        f.createArrayLiteralExpression(
            [f.createCallExpression(
                f.createIdentifier('primaryKey'),
                undefined,
                [f.createObjectLiteralExpression(
                    [f.createPropertyAssignment(
                        f.createIdentifier('columns'),
                        f.createArrayLiteralExpression(primaryKeyExprList, false),
                    )],
                    false,
                )],
            )],
            true,
        ),
    );

    const table = f.createVariableStatement(
        [f.createToken(ts.SyntaxKind.ExportKeyword)],
        f.createVariableDeclarationList([
            f.createVariableDeclaration(
                pascalcase(name),
                undefined,
                undefined,
                f.createCallExpression(
                    f.createPropertyAccessExpression(
                        f.createIdentifier('schema'),
                        f.createIdentifier('table'),
                    ),
                    undefined,
                    [
                        f.createStringLiteral(plur(name), true),
                        tableDefinition,
                        configExpr,
                    ],
                ),
            ),
        ], ts.NodeFlags.Const),
    );

    return [table, imports];
}

function createSimpleCallExpr(name: string, args: ts.Expression[] = []): ts.CallExpression {
    return f.createCallExpression(
        f.createIdentifier(name),
        undefined,
        args,
    );
}

function createTableKeyDefinition<T>(
    model: z.ZodType<T>,
    name: string | undefined,
): [ts.Expression, string[]] {
    const columnName = model.getMeta()?.colName ?? (name ?? '').replace(/[A-Z]/g, t => '_' + t.toLowerCase());

    const nameIdentArray = name != null
        ? [f.createStringLiteral(columnName)]
        : [];

    if (model instanceof z.ZodBoolean) {
        const decl = createSimpleCallExpr('boolean', nameIdentArray);

        return [decl, ['boolean']];
    }

    if (model instanceof z.ZodString) {
        if (model.getMeta()?.type == 'bitset') {
            const dimensions = model.getMeta()?.map?.length ?? 0;

            const dimExpr = f.createObjectLiteralExpression([
                f.createPropertyAssignment(
                    'dimensions',
                    f.createNumericLiteral(dimensions),
                ),
            ]);

            return [createSimpleCallExpr('bit', [...nameIdentArray, dimExpr]), ['bit']];
        }

        return [createSimpleCallExpr('text', nameIdentArray), ['text']];
    }

    if (model instanceof z.ZodNumber) {
        const type = model.getMeta()?.type;

        if (type === 'small-int') {
            return [createSimpleCallExpr('smallint', nameIdentArray), ['smallint']];
        } else if (type === 'int') {
            return [createSimpleCallExpr('integer', nameIdentArray), ['integer']];
        } else {
            return [createSimpleCallExpr('doublePrecision', nameIdentArray), ['doublePrecision']];
        }
    }

    if (model instanceof z.ZodEnum) {
        return [createSimpleCallExpr('text', nameIdentArray), ['text']];
    }

    if (model instanceof z.ZodRecord) {
        return [createSimpleCallExpr('jsonb', nameIdentArray), ['jsonb']];
    }

    if (model instanceof z.ZodArray) {
        const [itemDecl, itemImports] = createTableKeyDefinition(model.element, name);

        const decl = f.createCallExpression(
            f.createPropertyAccessExpression(itemDecl, 'array'),
            undefined,
            [],
        );

        return [decl, itemImports];
    }

    throw new Error(`Unsupported model type(${name}) ${model.constructor.name}, ${model.getMeta()?.type}`);
}
