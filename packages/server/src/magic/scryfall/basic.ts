import request from 'request-promise-native';

import { List } from '@interface/magic/scryfall/basic';

export async function* listOf<T>(url: string): AsyncGenerator<T[]> {
    let data: List<T>;

    do {
        data = JSON.parse(await request(url));

        yield data.data;

        if (data.has_more && data.next_page) {
            url = data.next_page;
        }
    } while (data.has_more);
}

export async function* dataOf<T>(url: string): AsyncGenerator<T> {
    for await (const list of listOf<T>(url)) {
        for (const e of list) {
            yield e;
        }
    }
}
