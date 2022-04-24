// import {
//     createRouter, createMemoryHistory, createWebHistory, createWebHashHistory,
// } from 'vue-router';

// import routes from './routes';

// import store from '../store';

// const createHistory = process.env.SERVER
//     ? createMemoryHistory
//     : process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory;

// const router = createRouter({
//     scrollBehavior: () => ({ left: 0, top: 0 }),
//     routes,

//     history: createHistory(process.env.VUE_ROUTER_BASE),
// });

// router.beforeEach((to, from, next) => {
//     if (to.meta.admin as boolean | null) {
//         const isAdmin = store.getters['user/isAdmin'];

//         if (!isAdmin) {
//             next(`/setting?redirect=${to.path}&admin=true`);
//         } else {
//             next();
//         }
//     } else if (to.meta.requireAuth as boolean | null) {
//         const user = store.getters['user/user'];

//         if (user == null) {
//             next(`/setting?redirect=${to.path}`);
//         } else {
//             next();
//         }
//     } else {
//         next();
//     }
// });

// export default router;

import { route } from 'quasar/wrappers';
import {
    createMemoryHistory,
    createRouter,
    createWebHashHistory,
    createWebHistory,
} from 'vue-router';

import routes from './routes';

/*
 * If not building with SSR mode, you can
 * directly export the Router instantiation;
 *
 * The function below can be async too; either use
 * async/await or return a Promise which resolves
 * with the Router instance.
 */

export default route((/* { store, ssrContext } */) => {
    const createHistory = process.env.SERVER
        ? createMemoryHistory
        : (process.env.VUE_ROUTER_MODE === 'history' ? createWebHistory : createWebHashHistory);

    const Router = createRouter({
        scrollBehavior: () => ({ left: 0, top: 0 }),
        routes,

        // Leave this as is and make changes in quasar.conf.js instead!
        // quasar.conf.js -> build -> vueRouterMode
        // quasar.conf.js -> build -> publicPath
        history: createHistory(process.env.VUE_ROUTER_BASE),
    });

    return Router;
});
