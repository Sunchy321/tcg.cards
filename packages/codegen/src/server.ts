import { Project, VariableDeclarationKind } from 'ts-morph';

import { addAutoGeneratedComment } from './util';

export const server = new Project({
    tsConfigFilePath: '../server/tsconfig.json',
});

export const serverSrc = server.getRootDirectories().find(d => d.getPath().endsWith('/server/src'))!;

export function generateServer(games: readonly string[]) {
    generateApi(games).saveSync();
}

function generateApi(games: readonly string[]) {
    const source = serverSrc.addSourceFileAtPath('api.ts');

    source.removeText();

    addAutoGeneratedComment(source);

    source.addImportDeclaration({
        leadingTrivia:   writer => writer.newLine(),
        moduleSpecifier: '@koa/router',
        defaultImport:   'KoaRouter',
    });

    source.addImportDeclaration({
        leadingTrivia:   writer => writer.newLine(),
        moduleSpecifier: `@/integrated/router/api`,
        defaultImport:   'integrated',
    });

    for (const [i, g] of games.entries()) {
        source.addImportDeclaration({
            leadingTrivia: writer => {
                if (i === 0) {
                    writer.newLine();
                }
            },
            moduleSpecifier: `@/${g}/router/api`,
            defaultImport:   g,
        });
    }

    source.addImportDeclaration({
        leadingTrivia:   writer => writer.newLine(),
        moduleSpecifier: '@interface/index',
        namedImports:    [
            { name: 'Game' },
            { name: 'games' },
        ],
    });

    source.addImportDeclaration({
        leadingTrivia:   writer => writer.newLine(),
        moduleSpecifier: '@static/index',
        defaultImport:   'data',
    });

    source.addVariableStatement({
        leadingTrivia:   writer => writer.newLine(),
        declarationKind: VariableDeclarationKind.Const,
        declarations:    [{
            name:        'router',
            initializer: 'new KoaRouter()',
        }],
    });

    source.addStatements(writer => {
        writer.newLine();
        writer.writeLine('router.get(\'/\', async ctx => {');
        writer.writeLine('    ctx.body = games;');
        writer.writeLine('});');
        writer.newLine();
    });

    source.addStatements(writer => {
        writer.newLine();
        writer.writeLine(`router.use(integrated.routes());`);
    });

    for (const [i, g] of games.entries()) {
        source.addStatements(writer => {
            if (i == 0) {
                writer.newLine();
            }

            writer.writeLine(`router.use(${g}.routes());`);
        });
    }

    source.addStatements(writer => {
        writer.newLine();
        writer.writeLine(' router.get(\'/:game\', async ctx => {');
        writer.writeLine('     const { game } = ctx.params;');
        writer.writeLine('     if (games.includes(game as Game)) {');
        writer.writeLine('         ctx.body = data[game as Game];');
        writer.writeLine('     } else {');
        writer.writeLine('         ctx.status = 404;');
        writer.writeLine('     }');
        writer.writeLine(' });');
    });

    source.addExportAssignment({
        leadingTrivia:  writer => writer.newLine(),
        isExportEquals: false,
        expression:     'router',
    });

    return source;
}
