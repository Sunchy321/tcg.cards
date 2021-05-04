const routes = [
    {
        path:      '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/hearthstone/Index.vue'),
            },

            {
                path:      'data',
                component: () => import('pages/hearthstone/Data.vue'),
                meta:      {
                    admin: true,
                },
            },
        ],
    },
];

export default routes;
