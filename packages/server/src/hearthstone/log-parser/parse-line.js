import lineReader from '../../common/line-reader';

export async function parseLine(path) {
    const result = [];

    for await (const text of lineReader(path)) {
        const line = {
            text,
        };

        let m = null;

        if (m = /^D (\d+:\d+:\d+\.\d+)/.exec(text)) {
            line.time = m[1];

            const main = text.slice(m[0].length).trim();
        }

        result.push(line);
    }

    return result;
}
