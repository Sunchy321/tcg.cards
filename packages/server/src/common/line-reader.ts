import fs from 'fs';
import readline from 'readline';

export default class LineReader {
    file: string;

    stream: fs.ReadStream;

    constructor(file: string) {
        this.file = file;
        this.reset();
    }

    reset(): void {
        this.stream = fs.createReadStream(this.file);
    }

    abort(): void {
        this.stream.destroy();
    }

    async* get(): AsyncGenerator<string> {
        const rl = readline.createInterface(this.stream);

        for await (const line of rl) {
            yield line;
        }
    }
}
