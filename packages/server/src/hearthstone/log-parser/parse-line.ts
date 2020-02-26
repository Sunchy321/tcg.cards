import lineReader from '../../common/line-reader';

interface ILine {
    text: string;

    time?: string;
}

export async function parseLine(path: string): Promise<ILine[]> {
    const result = [];

    for await (const text of lineReader(path)) {
        const line: ILine = {
            text,
        };

        let m: RegExpExecArray | null;

        if (m = /^D (\d+:\d+:\d+\.\d+)/.exec(text)) {
            line.time = m[1];

            const main = text.slice(m[0].length).trim();
        }

        result.push(line);
    }

    return result;
}
