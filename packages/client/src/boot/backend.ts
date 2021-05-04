import axios from 'axios';

function base(url: string) {
    return process.env.NODE_ENV === 'production'
        ? url
        : url + ':8889';
}

export const apiBase = base('api.tcg.cards');
export const imageBase = base('image.tcg.cards');
export const userBase = base('user.tcg.cards');
export const controlBase = base('control.tcg.cards');

export const api = axios.create({ baseURL: 'http://' + apiBase });
export const user = axios.create({ baseURL: 'http://' + userBase });
export const control = axios.create({ baseURL: 'http://' + controlBase });

export function apiGet<T>(url: string, params: Record<string, any> = {}) {
    return api.get<T>(url, { params });
}
