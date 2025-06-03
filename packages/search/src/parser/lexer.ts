export type Token = {
    type:     'id' | 'punc' | 'regex' | 'string' | 'ws';
    text:     string;
    location: [number, number];
};

export type LexOption = {
    text?: boolean;
};

export type LexError = {
    type:     string;
    location: [number, number];
};

export const defaultOption: LexOption = {
    text: false,
};

export default class Lexer {
    text:   string;
    errors: LexError[] = [];

    index:       number;
    savedIndex?: number;

    constructor(text: string) {
        this.text = text;
        this.index = 0;
    }

    private get curr() {
        return this.text[this.index];
    }

    private peekChar() {
        return this.text[this.index + 1];
    }

    private nextChar() {
        this.index += 1;
    }

    private isWhitespace(char = this.curr) {
        return ' '.includes(char);
    }

    private isPunctuator(char = this.curr) {
        return '-:()&|!>=<#'.includes(char);
    }

    private isString(char = this.curr) {
        return '\'"'.includes(char);
    }

    private isRegex(char = this.curr) {
        return '/'.includes(char);
    }

    private isIdentifierStart(char = this.curr) {
        return !this.isWhitespace(char)
          && !this.isString(char)
          && !this.isRegex(char)
          && !this.isPunctuator(char);
    }

    private isIdentifierRest(char = this.curr) {
        return '-'.includes(char);
    }

    private startToken() {
        this.savedIndex = this.index;
    }

    private returnToken(type: Token['type']): Token {
        const { savedIndex } = this;

        this.savedIndex = undefined;

        return {
            type,
            text:     this.text.slice(savedIndex, this.index),
            location: [savedIndex!, this.index],
        };
    }

    private newError(type: string, location: [number, number]) {
        this.errors.push({ type, location });
    }

    next(option = defaultOption): Token | null {
        if (this.curr == null) {
            return null;
        }

        if (this.isWhitespace()) {
            return this.parseWhitespace();
        }

        if (this.isPunctuator()) {
            if (option.text) {
                return this.parseIdentifier(option);
            } else {
                return this.parsePunctuator();
            }
        }

        if (this.isString()) {
            return this.parseString();
        }

        if (this.isRegex()) {
            return this.parseRegex();
        }

        if (this.isIdentifierStart()) {
            return this.parseIdentifier(option);
        }

        this.startToken();
        this.newError('unknown-char', [this.index, this.index + 1]);
        this.next();
        return this.returnToken('punc');
    }

    peek(option = defaultOption): Token | null {
        const i = this.index;

        const token = this.next(option);

        this.index = i;

        return token;
    }

    private parseWhitespace(): Token {
        this.startToken();

        while (this.curr != null && this.isWhitespace()) {
            this.nextChar();
        }

        return this.returnToken('ws');
    }

    private parsePunctuator(): Token {
        this.startToken();

        switch (this.curr) {
        case '!':
            this.nextChar();

            if ([':', '='].includes(this.curr)) {
                this.nextChar();
            }

            break;
        case '>':
        case '<':
            this.nextChar();

            if (['='].includes(this.curr)) {
                this.nextChar();
            }

            break;
        default:
            this.nextChar();
            break;
        }

        return this.returnToken('punc');
    }

    private parseString(): Token {
        this.startToken();

        const c = this.curr;

        this.nextChar();

        while (this.curr != null) {
            if (this.curr === '\\') {
                this.nextChar();

                if (this.curr == null) {
                    this.newError('unexpected-escape', [this.index - 1, this.index]);
                } else {
                    this.nextChar();
                }
            } else if (this.curr !== c) {
                this.nextChar();
            } else {
                break;
            }
        }

        if (this.curr == null) {
            this.newError('unterminated-string', [this.index - 1, this.index]);
        } else {
            this.nextChar();
        }

        return this.returnToken('string');
    }

    // regular expression is only allowed in such situations.
    private get inRegexContext() {
        const lastChar = this.text[this.index - 1];

        if (lastChar == null) {
            return true;
        }

        if (this.isWhitespace(lastChar)) {
            return true;
        }

        if (this.isPunctuator(lastChar)) {
            return true;
        }

        return false;
    }

    private parseRegexClass() {
        this.nextChar();

        while (this.curr != null) {
            if (this.curr === '\\') {
                this.nextChar();

                if (this.curr == null) {
                    this.newError('unexpected-escape', [this.index, this.index + 1]);
                } else {
                    this.nextChar();
                }
            } else if (this.curr === ']') {
                break;
            } else {
                this.nextChar();
            }
        }

        if (this.curr == null) {
            this.newError('unterminated-regex-class', [this.index - 1, this.index]);
        } else {
            this.nextChar();
        }
    }

    private parseRegex(): Token {
        this.startToken();

        if (!this.inRegexContext) {
            this.nextChar();
            return this.returnToken('punc');
        }

        this.nextChar();

        while (this.curr != null) {
            if (this.curr === '\\') {
                this.nextChar();

                if (this.curr == null) {
                    this.newError('unexpected-escape', [this.index, this.index + 1]);
                } else {
                    this.nextChar();
                }
            } else if (this.curr === '[') {
                this.parseRegexClass();
            } else if (this.curr === '/') {
                break;
            } else {
                this.nextChar();
            }
        }

        if (this.curr == null) {
            this.newError('unterminated-string', [this.index - 1, this.index]);
        } else {
            this.nextChar();
        }

        return this.returnToken('regex');
    }

    private parseIdentifier(option = defaultOption): Token {
        this.startToken();

        while (this.curr != null) {
            if (option.text) {
                if (this.isWhitespace()) {
                    break;
                }

                if (this.isPunctuator()) {
                    if ([')'].includes(this.curr)) {
                        break;
                    }
                }

                this.nextChar();
            } else {
                if (this.isIdentifierStart()) {
                    this.nextChar();
                } else if (this.isIdentifierRest()) {
                    if (this.isIdentifierStart(this.peekChar())) {
                        this.nextChar();
                    } else {
                        break;
                    }
                } else {
                    break;
                }
            }
        }

        return this.returnToken('id');
    }
}
