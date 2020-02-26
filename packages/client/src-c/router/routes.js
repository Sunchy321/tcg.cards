import hearthstone from './route/hearthstone';

const routes = [
    {
        path:      '/',
        component: () => import('layouts/Main.vue'),
        children:  [
            { path: '', component: () => import('pages/Index.vue') },
        ]
    },

    ...hearthstone,
];

// Always leave this as last one
if (process.env.MODE !== 'ssr') {
    routes.push({
        path:      '*',
        component: () => import('pages/Error404.vue')
    });
}

export default routes;
