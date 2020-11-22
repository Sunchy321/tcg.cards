/* eslint-disable camelcase */
import request from 'request-promise-native';

const clientID = '3f377ff8bb8b4a17815aacd1a591dcae';
// cSpell:disable
const clientSecret = 'Y73lS6TGHEQ5ZITREmi1vLSpSgXv8KVT';

interface IBlizzardToken {
    access_token: string;
    token_type: string;
    expires_in: number;
}

async function blzAuth(): Promise<string> {
    const auth = 'Basic ' + Buffer.from(clientID + ':' + clientSecret).toString('base64');

    const data: IBlizzardToken = JSON.parse(
        await request.post('https://www.battlenet.com.cn/oauth/token', {
            headers: {
                'content-type':  'application/x-www-form-urlencoded',
                'Authorization': auth,
            },
            body: 'grant_type=client_credentials',
        }),
    );

    return 'Bearer ' + data.access_token;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async function blzApi<T>(path: string, params?: Record<string, any>): Promise<T> {
    const auth = await blzAuth();

    let uri = 'https://us.api.blizzard.com/' + path;

    if (params != null) {
        uri += '?' + Object.entries(params).map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    }

    const data = JSON.parse(await request.get(uri, { headers: { Authorization: auth } }));

    return data;
}
