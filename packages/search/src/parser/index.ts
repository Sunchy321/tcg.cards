import { last } from 'lodash';
import SearchError from './error';
import Lexer, { defaultOption, Token } from './lexer';
import { Operator, Qualifier } from '../command';

export type ParserError = {
    type:     string;
    location: [number, number];
};

type ExprBase = {
    tokens:    Token[];
    location:  [number, number];
    topLevel?: boolean;
    qual?:     Qualifier[];
};

export type SimpleExpr = {
    type:    'simple';
    cmd:     string;
    op:      Operator;
    argType: Token['type'];
    args:    string;
};

export type RawExpr = {
    type:    'raw';
    argType: Token['type'];
    args:    string;
};

export type HashExpr = {
    type: 'hash';
    args:  string;
};

export type SlashExpr = {
    type: 'slash';
    args: string[];
};

export type NotExpr = {
    type: 'not';
    expr: Expression;
};

export type ParenExpr = {
    type: 'paren';
    expr: Expression;
};

export type LogicExpr = {
    type:  'logic';
    sep:   '' | '&' | '|';
    exprs: Expression[];
};

export type Expression = ExprBase & (HashExpr | LogicExpr | NotExpr | ParenExpr | RawExpr | SimpleExpr | SlashExpr);

export default class Parser {
    text:   string;
    lexer:  Lexer;
    tokens: Token[] = [];
    errors: ParserError[] = [];

    savedIndex: number[] = [];

    constructor(text: string) {
        this.text = text;
        this.lexer = new Lexer(text);
    }

    private get index() {
        return this.lexer.index;
    }

    private set index(newValue: number) {
        this.lexer.index = newValue;
    }

    private get lastPos(): [number, number] {
        return [this.text.length, this.text.length + 1];
    }

    private peek(option = defaultOption) {
        return this.lexer.peek(option);
    }

    private next(option = defaultOption) {
        const token = this.lexer.next(option);

        if (token != null) {
            this.tokens.push(token);
        }

        return token;
    }

    private undo() {
        const lastToken = last(this.tokens);

        if (lastToken != null) {
            this.index = lastToken.location[0];
            this.tokens.pop();
        }
    }

    private watchTokens() {
        this.savedIndex.push(this.tokens.length);
    }

    private returnTokens() {
        const savedIndex = this.savedIndex.pop();

        return this.tokens.slice(savedIndex);
    }

    skipWs(): Token[] {
        const tokens = [];

        let token;

        while ((token = this.lexer.peek()) != null) {
            if (token.type === 'ws') {
                tokens.push(token);
                this.next();
            } else {
                break;
            }
        }

        return tokens;
    }

    private newError(type: string, location: [number, number]) {
        this.errors.push({ type, location });
    }

    parse(): Expression {
        this.skipWs();

        let query;

        try {
            query = this.parseQuery();

            if (this.index !== this.text.length) {
                this.newError('unknown-token', [this.index, this.text.length]);
            }
        } catch (e) {
            while (true) {
                const token = this.lexer.next();

                if (token == null) {
                    break;
                } else {
                    this.tokens.push(token);
                }
            }

            throw e;
        }

        this.skipWs();

        if (this.lexer.errors.length > 0) {
            throw this.lexer.errors[0];
        }

        query.topLevel = true;

        if (query.type === 'logic') {
            for (const expr of query.exprs) {
                expr.topLevel = true;
            }
        }

        return query;
    }

    /**
     * Query:
     *     Unary (& Unary)+
     *     Unary (| Unary)+
     *     Unary+
     */
    parseQuery(): Expression {
        this.watchTokens();

        const token = this.peek();

        if (token == null) {
            throw new SearchError('empty-input', null, [0, this.text.length]);
        }

        let sep: string | undefined;
        const exprs = [];

        do {
            const expr = this.parseUnary();

            exprs.push(expr);

            this.skipWs();

            const next = this.peek();

            if (next == null) {
                break;
            }

            if (next.type === 'punc' && ['&', '|'].includes(next.text)) {
                this.next();

                this.skipWs();

                if (sep == null) {
                    sep = next.text;
                } else {
                    if (sep !== next.text) {
                        throw new SearchError('inconsistent-separator', null, next.location);
                    }
                }
            } else if (next.type === 'punc' && next.text === ')') {
                break;
            } else {
                if (sep == null) {
                    sep = '';
                } else {
                    if (sep !== '') {
                        throw new SearchError('inconsistent-separator', null, next.location);
                    }
                }
            }
        // eslint-disable-next-line no-constant-condition
        } while (true);

        if (exprs.length === 1) {
            return exprs[0];
        } else {
            return {
                type:     'logic',
                sep:      sep as any,
                exprs,
                tokens:   this.returnTokens(),
                location: [exprs[0].location[0], last(exprs)!.location[1]],
            };
        }
    }

    /**
     * Unary:
     *     Primary
     *     - Primary
     *     ! Primary
     */
    private parseUnary(): Expression {
        this.watchTokens();

        const token = this.peek();

        if (token == null) {
            throw new SearchError('empty-input', null, [0, this.text.length]);
        }

        if (token.type === 'punc' && ['-', '!'].includes(token.text)) {
            this.next();

            const expr = this.parsePrimary();

            return {
                type:     'not',
                expr,
                tokens:   this.returnTokens(),
                location: [token.location[0], expr.location[1]],
            };
        } else {
            this.returnTokens();
            return this.parsePrimary();
        }
    }

    /**
     * Primary:
     *     ( Query )
     *     id (:|!:|=|!=|>|<|>=|<=) (text|string|regex)
     *     # id
     *     id (/ id)+
     *     id | string | regex
     */
    private parsePrimary(): Expression {
        this.watchTokens();

        const first = this.peek();

        if (first == null) {
            throw new SearchError('unknown-token', null, this.lastPos);
        }

        if (first.type === 'punc' && first.text === '(') {
            this.next();

            const expr = this.parseQuery();

            this.skipWs();

            const next = this.peek();

            if (next == null || next.type !== 'punc' || next.text !== ')') {
                throw new SearchError(
                    'unclosed-paren',
                    null,
                    next?.location ?? this.lastPos,
                );
            }

            this.next();

            return {
                type:     'paren',
                expr,
                tokens:   this.returnTokens(),
                location: [first.location[0], next.location[1]],
            };
        }

        if (first.type === 'id') {
            this.next();

            const op = this.peek();

            if (op?.type === 'punc' && op?.text === '/') {
                const args = [first];

                this.next();

                do {
                    const arg = this.next();

                    if (arg == null || arg.type !== 'id') {
                        throw new SearchError('unknown-token', null, arg?.location ?? this.lastPos);
                    }

                    args.push(arg);

                    const next = this.peek();

                    if (next == null) {
                        break;
                    }

                    if (next.type === 'punc' && next.text === '/') {
                        this.next();
                    } else {
                        break;
                    }
                // eslint-disable-next-line no-constant-condition
                } while (true);

                return {
                    type:     'slash',
                    args:     args.map(a => a.text),
                    tokens:   this.returnTokens(),
                    location: [first.location[0], last(args)!.location[1]],
                };
            }

            if (op?.type === 'punc' && [':', '!:', '=', '!=', '>', '<', '>=', '<='].includes(op.text)) {
                this.next();

                const arg = this.next({ text: true });

                if (arg == null || !['id', 'string', 'regex'].includes(arg.type)) {
                    throw new SearchError('unknown-token', null, arg?.location ?? this.lastPos);
                }

                const { operator, qualifiers } = ['!:', '!='].includes(op.text)
                    ? { operator: op.text.slice(1), qualifiers: ['!'] }
                    : { operator: op.text, qualifiers: [] };

                return {
                    type:     'simple',
                    cmd:      first.text,
                    op:       operator as Operator,
                    qual:     qualifiers as Qualifier[],
                    argType:  arg.type,
                    args:     arg.text,
                    tokens:   this.returnTokens(),
                    location: [first.location[0], arg.location[1]],
                };
            }

            this.undo();

            const arg = this.next({ text: true });

            if (arg == null || !['id', 'string', 'regex'].includes(arg.type)) {
                throw new SearchError('unknown-token', null, arg?.location ?? this.lastPos);
            }

            return {
                type:     'raw',
                argType:  arg.type,
                args:     arg.text,
                tokens:   this.returnTokens(),
                location: arg.location,
            };
        }

        if (first.type === 'punc' && first.text === '#') {
            this.next();

            const arg = this.next({ text: true });

            if (arg == null || !['id'].includes(arg.type)) {
                throw new SearchError('unknown-token', null, arg?.location ?? this.lastPos);
            }

            return {
                type:     'hash',
                args:      arg.text,
                tokens:   this.returnTokens(),
                location: [first.location[0], arg.location[1]],
            };
        }

        if (first.type === 'string' || first.type === 'regex') {
            this.next();

            return {
                type:     'raw',
                argType:  first.type,
                args:     first.text,
                tokens:   this.returnTokens(),
                location: first.location,
            };
        }

        throw new SearchError('unknown-token', null, first.location);
    }
}
