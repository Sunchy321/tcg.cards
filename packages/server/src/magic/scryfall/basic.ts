import axios from 'axios';

import { List } from '@interface/magic/scryfall/basic';

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
