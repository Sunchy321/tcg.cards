import axios from 'axios';

import { join } from 'path';

const apiBase = process.env.NODE_ENV === 'production'
    ? 'api.tcg.cards'
    : 'api.test.local:8889';

const userBase = process.env.NODE_ENV === 'production'
    ? 'user.tcg.cards'
    : 'user.test.local:8889';

export const api = axios.create({ baseURL: 'http://' + apiBase });

export const user = axios.create({ baseURL: 'http://' + userBase });

export default async ({ Vue }) => {
    Vue.prototype.apiGet = function(url, params) {
        const token = this?.$store?.getters?.['user/token'];

        if (token != null) {
            return api.get(url, {
                headers: {
                    Authentication: 'Bearer ' + token,
                },
                params,
            });
        } else {
            return api.get(url, { params });
        }
    };

    Vue.prototype.apiPost = function(url, params) {
        const token = this?.$store?.getters?.['user/token'];

        if (token != null) {
            return api.post(url, params, {
                headers: {
                    Authentication: 'Bearer ' + token,
                },
            });
        } else {
            return api.post(url, params);
        }
    };

    Vue.prototype.apiWs = function(url, params) {
        const token = this?.$store?.getters?.['user/token'];

        params = params || {};
        params = token != null ? { jwt: token, ...params } : params;

        if (Object.keys(params).length === 0) {
            return new WebSocket(`ws://${join(apiBase, url)}`);
        } else {
            return new WebSocket(`ws://${join(apiBase, url)}?${
                Object.entries(params).map(
                    ([k, v]) => `${k}=${encodeURIComponent(v)}`,
                ).join('&')
            }`);
        }
    };
};
