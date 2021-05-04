import { createRouter, createMemoryHistory, createWebHistory, createWebHashHistory } from 'vue-router';

import routes from './routes';

import store from '../store';

const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory;

const router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    history: createHistory(process.env.VUE_ROUTER_BASE),
});

router.beforeEach((to, from, next) => {
    if (to.meta.admin) {
        const isAdmin = store.getters['user/isAdmin'];

        if (!isAdmin) {
            next(`/setting?redirect=${to.path}&admin=true`);
        } else {
            next();
        }
    } else if (to.meta.requireAuth) {
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

export default router;
