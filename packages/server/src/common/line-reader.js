import * as fs from 'fs';
import * as readline from 'readline';
import * as Reader from 'async-stream-reader';

export default async function* lineReader(path) {
    const rl = readline.createInterface({
        input: fs.createReadStream(path),
    });

    const reader = new Reader(rl, {
        events: { data: 'line', end: 'close' },
    });

    let line;

    // tslint:disable-next-line: no-conditional-assignment
    while (line = await reader.next()) {
        yield await line;
    }
}