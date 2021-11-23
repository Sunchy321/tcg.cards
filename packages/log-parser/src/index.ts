import parser from './syntax.pegjs';

export function parseLog(text: string) {
    const result = parser.parse(text);

    return result;
}