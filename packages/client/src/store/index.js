import Vue from 'vue';
import Vuex from 'vuex';

import core from './core';
import user from './user';

import * as games from './games';

Vue.use(Vuex);

const Store = new Vuex.Store({
    modules: { core, user, ...games },

    strict: process.env.DEV,
});

export default Store;
