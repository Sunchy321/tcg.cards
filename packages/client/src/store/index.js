import Vue from 'vue';
import Vuex from 'vuex';

import core from './core';
import locale from './locale';

Vue.use(Vuex);

const Store = new Vuex.Store({
    modules: {
        core,
        locale,
    },

    strict: process.env.DEV,
});

export default Store;
