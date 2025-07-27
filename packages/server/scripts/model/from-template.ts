import { Game } from '@model-data/index';

import * as fs from 'fs';
import _ from 'lodash';
import ts, { factory as f } from 'typescript';

function isGameIdentifier(node: ts.Node): boolean {
    return ts.isIdentifier(node) && node.text === '__GAME__';
}

export function genFromTemplate(g: Game, src: string) {
    console.log(`Gen file ${g}/${src}`);

    const sourcePath = `./template/${src}`;
    const targetPath = `./src/${g}/${src}`;

    const program = ts.createProgram(
        [sourcePath],
        {
            target:          ts.ScriptTarget.ESNext,
            module:          ts.ModuleKind.ESNext,
            strict:          true,
            esModuleInterop: true,
            skipLibCheck:    true,
        },
    );

    const sourceFile = program.getSourceFile(sourcePath)!;

    const replacer = (node: ts.Node) => {
        if (isGameIdentifier(node)) {
            return f.createStringLiteral(g, true);
        }

        if (ts.isTemplateExpression(node)) {
            let headText = node.head.text;
            let headRawText = node.head.rawText;
            const spans: [ts.Expression, string, string | undefined][] = [];

            for (const span of node.templateSpans) {
                if (isGameIdentifier(span.expression)) {
                    if (spans.length > 0) {
                        const lastSpan = _.last(spans)!;

                        lastSpan[1] += g + span.literal.text;
                        lastSpan[2] = (lastSpan[2] ?? '') + g + (span.literal.rawText ?? '');
                    } else {
                        headText += g + span.literal.text;
                        headRawText = (headRawText ?? '') + g + (span.literal.rawText ?? '');
                    }
                } else {
                    spans.push([span.expression, span.literal.text, span.literal.rawText]);
                }
            }

            if (spans.length === 0) {
                return f.createStringLiteral(headText, true);
            } else {
                const newHead = f.createTemplateHead(headText, headRawText);

                const newSpans = spans.map(([expr, text, rawText], i, arr) => {
                    const literal = i === arr.length
                        ? f.createTemplateMiddle(text, rawText)
                        : f.createTemplateTail(text, rawText);

                    return f.createTemplateSpan(expr, literal);
                });

                return f.createTemplateExpression(newHead, newSpans);
            }
        }

        return ts.visitEachChild(node, replacer, undefined);
    };

    const newFile = ts.visitEachChild(sourceFile, node => {
        if (ts.isImportDeclaration(node)) {
            const clause = node.importClause;

            if (clause?.namedBindings != null) {
                const namedBindings = clause.namedBindings;

                if (ts.isNamedImports(namedBindings)) {
                    const elems = namedBindings.elements;

                    if (elems.length == 1 && elems[0].name.text === '__GAME__') {
                        return undefined;
                    }
                }
            }
        }

        return replacer(node);
    }, undefined);

    const resultFile = ts.createSourceFile(
        targetPath,
        '',
        ts.ScriptTarget.Latest,
        false,
        ts.ScriptKind.TS,
    );

    const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });

    const result = printer.printNode(ts.EmitHint.SourceFile, newFile, resultFile);

    const dir = targetPath.substring(0, targetPath.lastIndexOf('/'));

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, result);
}
