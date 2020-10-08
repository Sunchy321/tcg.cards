import Vue from 'vue';
import VueRouter from 'vue-router';

import routes from './routes';

import store from '../store';

Vue.use(VueRouter);

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation
 */

export default async function() {
    const Router = new VueRouter({
        scrollBehavior: () => ({ x: 0, y: 0 }),
        routes,

        // Leave these as is and change from quasar.conf.js instead!
        // quasar.conf.js -> build -> vueRouterMode
        // quasar.conf.js -> build -> publicPath
        mode: process.env.VUE_ROUTER_MODE,
        base: process.env.VUE_ROUTER_BASE,
    });

    Router.beforeEach(async (to, from, next) => {
        if (to.matched.some(r => r.meta.requireAdmin)) {
            const isAdmin = await store.dispatch('isAdmin');

            if (!isAdmin) {
                next({ name: 'setting' });
            } else {
                next();
            }
        } else if (to.matched.some(r => r.meta.requireAuth)) {
            const hasLoggedIn = await store.dispatch('hasLoggedIn');

            if (!hasLoggedIn) {
                next({ name: 'setting' });
            } else {
                next();
            }
        } else {
            next();
        }
    });

    return Router;
}
