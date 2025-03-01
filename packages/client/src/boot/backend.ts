import axios, { AxiosResponse } from 'axios';

function base(subdomain: string) {
    return process.env.PROD ? `https://${subdomain}.tcg.cards` : `http://${subdomain}.tcg.cards:8889`;
}

export const apiBase = base('api');
export const imageBase = base('image');
export const userBase = base('user');
export const controlBase = base('control');

export const assetBase = 'https://asset.tcg.cards';

export const api = axios.create({ baseURL: apiBase });
export const user = axios.create({ baseURL: userBase });
export const control = axios.create({ baseURL: controlBase });

export async function apiGet<T>(url: string, params: Record<string, any> = {}): Promise<AxiosResponse<T>> {
    return api.get<T>(url, { params });
}
