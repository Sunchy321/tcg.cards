import magic from './magic';

const routes = [
    {
        path:      '/',
        component: () => import('layouts/Main.vue'),
        children:  [
            { path: '', component: () => import('pages/Index.vue') },
        ]
    },

    ...magic,
];

if (process.env.MODE !== 'ssr') {
    routes.push({
        path:      '*',
        component: () => import('pages/Error404.vue')
    });
}

export default routes;
