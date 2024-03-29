import Parser from './parser';
import { Token } from './parser/lexer';

export default function tokenize(text: string): Token[] {
    const expr = new Parser(text).parseQuery();

    return [];
}
