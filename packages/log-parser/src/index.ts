import Parser from './parser';
import transform from './transform';
import compile from './compile';

export function parseLog(text: string): any {
    const lines = new Parser(text).parse();
    const transformed = transform(lines);
    const compiled = compile(transformed);

    return compiled;
}
