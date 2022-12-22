import { join } from 'path';
import { dataPath } from '@/config';

export const bulkPath = join(dataPath, 'magic/scryfall');

export async function* convertJson<T>(gen: AsyncGenerator<string>): AsyncGenerator<T> {
    for await (const line of gen) {
        if (line === '[') {
            continue;
        } else if (line === ']') {
            return;
        }

        const json = JSON.parse(line.replace(/,$/, ''));

        yield json as T;
    }
}
