import axios from 'axios';

function base(subdomain: string) {
    return process.env.PROD ? `https://${subdomain}.tcg.cards` : `https://${subdomain}.tcg.cards:8889`;
}

export const apiBase = base('api');
export const assetBase = base('asset');
export const userBase = base('user');
export const controlBase = base('service');

export const api = axios.create({ baseURL: apiBase });
export const user = axios.create({ baseURL: userBase });
export const control = axios.create({ baseURL: controlBase });
