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
        if (to.path !== from.path) {
            store.commit('selections', []);
        }

        if (to.matched.some(r => r.meta.requireAdmin)) {
            const isAdmin = store.getters['user/isAdmin'];

            if (!isAdmin) {
                next(`/setting?redirect=${to.path}&admin=true`);
            } else {
                next();
            }
        } else if (to.matched.some(r => r.meta.requireAuth)) {
            const user = store.getters['user/user'];

            if (user == null) {
                next(`/setting?redirect=${to.path}`);
            } else {
                next();
            }
        } else {
            next();
        }
    });

    return Router;
}
