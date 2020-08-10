import * as request from 'request-promise-native';

export async function getList(uri) {
    const result = [];

    let data = null;

    do {
        data = JSON.parse(await request(uri));

        for (const v of data.data) {
            result.push(v);
        }

        if (data.has_more) {
            uri = data.next_page;
        }
    } while (data.has_more);

    if (data.total_cards != null && result.length !== data.total_cards) {
        throw new Error('Number mismatch');
    }

    return result;
}
