import Vue from 'vue';
import Vuex from 'vuex';

import core from './core';
import user from './user';
import locale from './locale';

Vue.use(Vuex);

const Store = new Vuex.Store({
    modules: {
        core,
        user,
        locale,
    },

    strict: process.env.DEV,
});

export default Store;
