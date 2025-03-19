import axios from 'axios';

import { hearthstone } from '@/config';
import { URL, URLSearchParams } from 'url';

const clientID = hearthstone.blizzard.clientId;
const { clientSecret } = hearthstone.blizzard;

interface IBlizzardToken {
    access_token: string;
    token_type:   string;
    expires_in:   number;
}

async function blzAuth(): Promise<string> {
    const auth = `Basic ${Buffer.from(`${clientID}:${clientSecret}`).toString('base64')}`;

    const data: IBlizzardToken = JSON.parse(
        await axios.post('https://www.battlenet.com.cn/oauth/token', {
            headers: {
                'content-type':  'application/x-www-form-urlencoded',
                'Authorization': auth,
            },
            body: 'grant_type=client_credentials',
        }),
    );

    return `Bearer ${data.access_token}`;
}

export default async function blzApi<T>(path: string, params?: Record<string, any>): Promise<T> {
    const auth = await blzAuth();

    const url = new URL(path, 'https://us.api.blizzard.com');

    if (params != null) {
        url.search = new URLSearchParams(params).toString();
    }

    const { data } = await axios.get<T>(url.toString(), { headers: { Authorization: auth } });

    return data;
}
