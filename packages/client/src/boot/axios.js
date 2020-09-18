import Vue from 'vue';
import axios from 'axios';

Vue.prototype.api = axios.create({
    baseURL: process.env.NODE_ENV === 'production' ? 'api.tcg.cards' : '/api'
});
