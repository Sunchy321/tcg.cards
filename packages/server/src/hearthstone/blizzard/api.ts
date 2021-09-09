/* eslint-disable camelcase */
import request from 'request-promise-native';

import { hearthstone } from '@static';

const clientID = hearthstone.blizzard.clientId;
const clientSecret = hearthstone.blizzard.clientSecret;

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
