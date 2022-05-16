import axios, { AxiosResponse } from 'axios';

function base(prod: string, dev: string) {
    return process.env.PROD ? prod : dev;
}

export const apiBase = base('api.tcg.cards', 'api.tcg.cards:8889');
export const imageBase = base('image.tcg.cards', 'image.tcg.cards:8889');
export const userBase = base('user.tcg.cards', 'user.tcg.cards:8889');
export const controlBase = base('control.tcg.cards', 'control.tcg.cards:8889');

export const api = axios.create({ baseURL: `https://${apiBase}` });
export const user = axios.create({ baseURL: `https://${userBase}` });
export const control = axios.create({ baseURL: `https://${controlBase}` });

export async function apiGet<T>(url: string, params: Record<string, any> = {}): Promise<AxiosResponse<T>> {
    return api.get<T>(url, { params });
}
