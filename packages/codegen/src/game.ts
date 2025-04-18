import { Directory, Project, SourceFile, VariableDeclarationKind } from 'ts-morph';

import { createModel, modelIntoSchema } from './model';
import { cloneDeep, last } from 'lodash';

export const server = new Project({
    tsConfigFilePath: '../server/tsconfig.json',
});

export const serverSrc = server.getRootDirectories().find(d => d.getPath().endsWith('/server/src'))!;

export class Game {
    #source: Directory;
    #name:   string;

    constructor(source: Directory) {
        this.#source = source;
        this.#name = source.getBaseName();
    }

    generate(): void {
        this.generateDatabase();
    }

    generateDatabase(): void {
        this.generateCardDatabase().saveSync();
    }

    generateCardDatabase(): SourceFile {
        const name = `${this.#name}/db/card.ts`;

        const files = this.#source.getSourceFiles();

        const cardFile = files.find(f => f.getBaseName() === 'card.ts');

        if (cardFile == null) {
            throw new Error(`card.ts not found in ${this.#name}`);
        }

        const card = cardFile.getExportedDeclarations().get('Card')?.[0];

        if (card == null) {
            throw new Error(`Card class not found in ${cardFile.getBaseName()}`);
        }

        const cardModel = createModel(card as any);

        const source = serverSrc.addSourceFileAtPathIfExists(name) ?? serverSrc.createSourceFile(name);

        source.removeText();

        source.addStatements('/** AUTO GENERATED, DO NOT CHANGE **/');

        source.addImportDeclaration({
            leadingTrivia:   writer => writer.newLine(),
            moduleSpecifier: 'mongoose',
            namedImports:    [
                {
                    name: 'Model',
                },
                {
                    name: 'Schema',
                },
            ],
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
                {
                    name: 'ICardDatabase',
                },
            ],
        });

        const cardDatabaseModel = cloneDeep(cardModel);

        if (cardDatabaseModel.kind != 'object') {
            throw new Error('Wrong card model type');
        }

        if (last(cardDatabaseModel.keyValues) != null) {
            last(cardDatabaseModel.keyValues)!.hasTrailingEmptyLine = true;
        }

        cardDatabaseModel.keyValues.push(
            {
                key:   '__updations',
                value: {
                    kind:    'array',
                    element: {
                        kind:      'object',
                        keyValues: [
                            { key: 'key', value: { kind: 'primitive', type: 'string' } },
                            { key: 'partIndex', value: { kind: 'primitive', type: 'number' } },
                            { key: 'lang', value: { kind: 'primitive', type: 'string' } },
                            { key: 'oldValue', value: { kind: 'primitive', type: 'any' } },
                            { key: 'newValue', value: { kind: 'primitive', type: 'any' } },
                        ],
                    },
                },
            },
        );

        cardDatabaseModel.keyValues.push({
            key:   '__lockedPaths',
            value: {
                kind:    'array',
                element: {
                    kind: 'primitive',
                    type: 'string',
                },
            },
        });

        source.addVariableStatement({
            leadingTrivia:   '// eslint-disable-next-line @typescript-eslint/no-empty-object-type',
            trailingTrivia:  writer => writer.newLine(),
            declarationKind: VariableDeclarationKind.Const,
            declarations:    [{
                name:        'CardSchema',
                initializer: writer => {
                    writer.write(
                        'new Schema<ICardDatabase, Model<ICardDatabase>, {}, {}, {}, {}, \'$type\'>('
                        + modelIntoSchema(cardDatabaseModel)
                        + `, {
    typeKey: '$type',
    toJSON:  {
        transform(doc, ret) {
            delete ret._id;
            delete ret.__v;
            delete ret.__lockedPaths;
            delete ret.__updations;

            return ret;
        },
    },
})`,
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
