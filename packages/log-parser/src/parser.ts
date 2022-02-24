import { last } from 'lodash';

export interface Line {
    lineNumber: number;
    date: string;
    method: string;
    indent: number;
    text: string;
}

export type RawItem = Line & { children?: RawItem[] };

export default class Parser {
    text: string;
    lines: Line[];
    curr: number;

    constructor(text: string) {
        this.text = text;
        this.lines = [];
        this.splitLines();

        this.curr = 0;
    }

    splitLines(): void {
        const lineTexts = this.text.split(/\r\n?|\n/);

        for (const [lineNumber, lineText] of lineTexts.entries()) {
            const m = /^D (\d+:\d+:\d+\.\d+) ([A-Za-z.]+)\(\) - ( *)(.*)$/.exec(lineText);

            if (m != null) {
                this.lines.push({
                    lineNumber,
                    date:   m[1],
                    method: m[2],
                    indent: m[3].length / 4,
                    text:   m[4].trim(),
                });
            }
        }
    }

    parse(): RawItem[] {
        const result: RawItem[] = [];

        function insertLine(line: Line, array: RawItem[]) {
            const lastLine = last(array);

            if (lastLine == null) {
                array.push({ ...line });
                return;
            }

            if (line.method !== lastLine.method) {
                array.push({ ...line });
                return;
            }

            if (line.indent <= lastLine.indent) {
                array.push({ ...line });
                return;
            }

            if (lastLine.children == null) {
                lastLine.children = [];
            }

            insertLine(line, lastLine.children);
        }

        for (const l of this.lines) {
            insertLine(l, result);
        }

        return result;
    }
}
