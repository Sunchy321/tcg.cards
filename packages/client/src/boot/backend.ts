import axios, { AxiosResponse } from 'axios';

function base(prod: string, dev: string) {
    return process.env.PROD ? prod : dev;
}

export const apiBase = base('api.tcg.cards', 'api.tcg-dev.cards:8889');
export const imageBase = base('image.tcg.cards', 'image.tcg-dev.cards:8889');
export const userBase = base('user.tcg.cards', 'user.tcg-dev.cards:8889');
export const controlBase = base('control.tcg.cards', 'control.tcg-dev.cards:8889');

export const api = axios.create({ baseURL: `http://${apiBase}` });
export const user = axios.create({ baseURL: `http://${userBase}` });
export const control = axios.create({ baseURL: `http://${controlBase}` });

export async function apiGet<T>(url: string, params: Record<string, any> = {}): Promise<AxiosResponse<T>> {
    return api.get<T>(url, { params });
}
