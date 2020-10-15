import axios from 'axios';

export const api = axios.create({
    baseURL: process.env.NODE_ENV === 'production'
        ? 'http://api.tcg.cards'
        : 'http://api.test.local:8889',
});

export const user = axios.create({
    baseURL: process.env.NODE_ENV === 'production'
        ? 'http://user.tcg.cards'
        : 'http://user.test.local:8889',
});

export default async ({ Vue }) => {
    Vue.prototype.api = api;

    Vue.prototype.user = user;
};
