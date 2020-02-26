import { ISList } from './interface';

import * as request from 'request-promise-native';

export async function getList<T>(uri: string): Promise<T[]> {
    const result: T[] = [];

    let data: ISList<T>;

    do {
        data = JSON.parse((await request(uri)) as string) as ISList<T>;

        for (const v of data.data) {
            result.push(v as unknown as T);
        }

        if (data.has_more) {
            uri = data.next_page!;
        }
    } while (data.has_more);

    if (data.total_cards != null && result.length !== data.total_cards) {
        throw new Error('Number mismatch');
    }

    return result;
}
