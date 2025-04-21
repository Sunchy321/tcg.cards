import { Directory, ExportedDeclarations, Project, SourceFile, SyntaxKind, VariableDeclarationKind } from 'ts-morph';

import { createModel } from './model';
import { applyComputed, parseComputed } from './computed';
import { modelIntoSchema, printSchema } from './schema';

export const server = new Project({
    tsConfigFilePath: '../server/tsconfig.json',
});

export const serverSrc = server.getRootDirectories().find(d => d.getPath().endsWith('/server/src'))!;

export class Game {
    #name:      string;
    #interface: Directory;
    #model:     Directory;

    constructor(source: Directory, model: Directory) {
        this.#name = source.getBaseName();
        this.#interface = source;
        this.#model = model;
    }

    getInterface(name: string): SourceFile {
        return this.#interface.getSourceFileOrThrow(name);
    }

    getModel(name: string): SourceFile {
        return this.#model.getSourceFileOrThrow(name);
    }

    tryGetModel(name: string): SourceFile | undefined {
        return this.#model.getSourceFile(name);
    }

    hasDeclaration(source: SourceFile, name: string): boolean {
        return source.getExportedDeclarations().get(name) != null;
    }

    getDeclaration(source: SourceFile, name: string): ExportedDeclarations {
        const result = source.getExportedDeclarations().get(name)?.[0];

        if (result == null) {
            throw new Error(`exported declaration ${name} not found in ${source.getBaseName()}`);
        }

        return result;
    }

    tryGetDeclaration(source: SourceFile | undefined, name: string): ExportedDeclarations | undefined {
        return source?.getExportedDeclarations()?.get(name)?.[0];
    }

    generate(): void {
        this.generateDatabase();
    }

    generateDatabase(): void {
        this.generateDatabaseConn().saveSync();
        this.generateCardDatabase().saveSync();
    }

    generateDatabaseConn(): SourceFile {
        const dbName = `${this.#name}/db/db.ts`;

        const source = serverSrc.addSourceFileAtPathIfExists(dbName) ?? serverSrc.createSourceFile(dbName);

        source.removeText();

        source.addStatements('/** AUTO GENERATED, DO NOT CHANGE **/');

        source.addImportDeclaration({
            moduleSpecifier: '@/db',
            namedImports:    [{ name: 'connect' }],
        });

        source.addVariableStatement({
            leadingTrivia:   writer => writer.newLine(),
            declarationKind: VariableDeclarationKind.Const,
            declarations:    [{
                name:        'conn',
                initializer: `connect('${this.#name}')`,
            }],
        });

        source.addExportAssignment({
            leadingTrivia:  writer => writer.newLine(),
            isExportEquals: false,
            expression:     'conn',
        });

        return source;
    }

    generateCardDatabase(): SourceFile {
        const name = `${this.#name}/db/card.ts`;

        const card = this.getDeclaration(this.getInterface('card.ts'), 'Card');

        const cardDatabase = this.getDeclaration(this.getModel('card.ts'), 'ICardDatabase');

        const cardModel = createModel(card as any);

        if (!cardDatabase.isKind(SyntaxKind.TypeAliasDeclaration)) {
            throw new Error('Wrong card database type');
        }

        let cardDatabaseModel = createModel(cardDatabase as any);

        const computedList = parseComputed(cardDatabase);

        cardDatabaseModel = applyComputed(cardDatabaseModel, computedList ?? []);

        if (cardModel.kind !== 'object' || cardDatabaseModel.kind !== 'object') {
            throw new Error('Wrong card database model type');
        }

        cardDatabaseModel.keyValues.sort((a, b) => {
            const aIndex = cardModel.keyValues.findIndex(v => v.key === a.key);
            const bIndex = cardModel.keyValues.findIndex(v => v.key === b.key);

            if (aIndex === -1) {
                if (bIndex === -1) {
                    return 0;
                } else {
                    return 1;
                }
            } else {
                if (bIndex === -1) {
                    return -1;
                } else {
                    return aIndex - bIndex;
                }
            }
        });

        for (const [i, kv] of cardDatabaseModel.keyValues.entries()) {
            const cardItem = cardModel.keyValues.find(v => v.key === kv.key);

            if (cardItem == null) {
                if (i > 0) {
                    const lastItem = cardDatabaseModel.keyValues[i - 1];

                    const lastCardItem = cardModel.keyValues.find(v => v.key === lastItem.key);

                    if (lastCardItem != null) {
                        lastItem.hasTrailingNewline = true;
                    }
                }
            } else {
                kv.hasTrailingNewline = cardItem.hasTrailingNewline;
            }
        }

        const source = serverSrc.addSourceFileAtPathIfExists(name) ?? serverSrc.createSourceFile(name);

        source.removeText();

        source.addStatements('/** AUTO GENERATED, DO NOT CHANGE **/');

        source.addImportDeclaration({
            moduleSpecifier: 'mongoose',
            namedImports:    [{ name: 'Model' }, { name: 'Schema' }],
        });

        source.addImportDeclaration({
            leadingTrivia:   writer => writer.newLine(),
            moduleSpecifier: './db',
            defaultImport:   'conn',
        });

        source.addImportDeclaration({
            leadingTrivia:   writer => writer.newLine(),
            moduleSpecifier: `@common/model/${this.#name}/card`,
            namedImports:    [
                { name: 'ICardDatabase' },
                { name: 'toJSON' },
                ...(computedList ?? []).map(c => ({ name: c.watcher })),
            ],
        });

        source.addVariableStatement({
            leadingTrivia:   '// eslint-disable-next-line @typescript-eslint/no-empty-object-type',
            declarationKind: VariableDeclarationKind.Const,
            declarations:    [{
                name:        'CardSchema',
                initializer: writer => {
                    writer.write(
                        'new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, \'$type\'>('
                        + printSchema(modelIntoSchema(cardDatabaseModel))
                        + `, {\n typeKey: '$type',\n toJSON: { transform: toJSON } \n})`,
                    );
                },
            }],
        });

        source.addVariableStatement({
            leadingTrivia:   writer => writer.newLine(),
            declarationKind: VariableDeclarationKind.Const,
            declarations:    [{
                name:        'Card',
                initializer: 'conn.model(\'card\', CardSchema)',
            }],
        });

        source.addExportAssignment({
            leadingTrivia:  writer => writer.newLine(),
            isExportEquals: false,
            expression:     'Card',
        });

        return source;
    }
}
