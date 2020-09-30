import Vue from 'vue';
import axios from 'axios';

export const api = axios.create({
    baseURL: process.env.NODE_ENV === 'production' ? 'api.tcg.cards' : '/api'
});

export const user = axios.create({
    baseURL: process.env.NODE_ENV === 'production' ? 'user.tcg.cards' : '/user'
});

Vue.prototype.api = api;

Vue.prototype.user = user;
