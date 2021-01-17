import axios from 'axios';

import { join } from 'path';

const apiBase = process.env.NODE_ENV === 'production'
    ? 'api.tcg.cards'
    : 'api.tcg.cards:8889';

export const imageBase = process.env.NODE_ENV === 'production'
    ? 'image.tcg.cards'
    : 'image.tcg.cards:8889';

const userBase = process.env.NODE_ENV === 'production'
    ? 'user.tcg.cards'
    : 'user.tcg.cards:8889';

const controlBase = process.env.NODE_ENV === 'production'
    ? 'control.tcg.cards'
    : 'control.tcg.cards:8889';

export const api = axios.create({ baseURL: 'http://' + apiBase });
export const user = axios.create({ baseURL: 'http://' + userBase });
const control = axios.create({ baseURL: 'http://' + controlBase });

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

    Vue.prototype.controlGet = function(url, params) {
        const token = this?.$store?.getters?.['user/token'];

        if (token != null) {
            return control.get(url, {
                headers: {
                    Authentication: 'Bearer ' + token,
                },
                params,
            });
        } else {
            return control.get(url, { params });
        }
    };

    Vue.prototype.controlPost = function(url, params) {
        const token = this?.$store?.getters?.['user/token'];

        if (token != null) {
            return control.post(url, params, {
                headers: {
                    Authentication: 'Bearer ' + token,
                },
            });
        } else {
            return control.post(url, params);
        }
    };

    Vue.prototype.controlWs = function(url, params) {
        const token = this?.$store?.getters?.['user/token'];

        params = params || {};
        params = token != null ? { jwt: token, ...params } : params;

        if (Object.keys(params).length === 0) {
            return new WebSocket(`ws://${join(controlBase, url)}`);
        } else {
            return new WebSocket(`ws://${join(controlBase, url)}?${
                Object.entries(params).map(
                    ([k, v]) => `${k}=${encodeURIComponent(v)}`,
                ).join('&')
            }`);
        }
    };
};
