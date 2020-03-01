import Vue from 'vue';
import VueRouter from 'vue-router';

import axios from 'axios';

import normalRoutes from './normal';
import controlRotues from './control';

Vue.use(VueRouter);

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation
 */

export default async function () {
    const { data: enableControl } = await axios.get('/basic/enable-control');

    const routes = [...normalRoutes];

    if (enableControl) {
        routes.push(...controlRotues);
    }

    const Router = new VueRouter({
        scrollBehavior: () => ({ x: 0, y: 0 }),
        routes,

        // Leave these as is and change from quasar.conf.js instead!
        // quasar.conf.js -> build -> vueRouterMode
        // quasar.conf.js -> build -> publicPath
        mode: process.env.VUE_ROUTER_MODE,
        base: process.env.VUE_ROUTER_BASE
    });

    return Router;
}
