import axios from 'axios';
import { join } from 'path';

import { List } from '@model/magic/schema/data/scryfall/basic';

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

export async function* listOf<T>(url: string): AsyncGenerator<T[]> {
    let listData: List<T>;

    do {
        ({ data: listData } = await axios.get<List<T>>(url));

        yield listData.data;

        if (listData.has_more && listData.next_page != null) {
            url = listData.next_page;
        }
    } while (listData.has_more);
}

export async function* dataOf<T>(url: string): AsyncGenerator<T> {
    for await (const list of listOf<T>(url)) {
        for (const e of list) {
            yield e;
        }
    }
}
