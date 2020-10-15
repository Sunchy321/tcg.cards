import * as request from 'request-promise-native';

export async function getList<T>(uri: string): Promise<T[]> {
    const result: T[] = [];

    let data = null;

    do {
        data = JSON.parse(await request(uri));

        result.push(...data.data);

        if (data.has_more) {
            uri = data.next_page;
        }
    } while (data.has_more);

    if (data.total_cards != null && result.length !== data.total_cards) {
        throw new Error('Number mismatch');
    }

    return result;
}
