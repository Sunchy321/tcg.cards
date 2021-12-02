import parser from './syntax.pegjs';

export function parseLog(text: string): any {
    const result = parser.parse(text);

    return result;
}
