import Parser from './model/parser/parser';
import { Token } from './model/parser/lexer';

export default function tokenize(text: string): Token[] {
    const expr = new Parser(text).parseQuery();

    return [];
}
