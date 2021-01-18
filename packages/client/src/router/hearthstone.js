const routes = [
    {
        path:      '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/hearthstone/Index'),
            },

            {
                path:      'data',
                component: () => import('pages/hearthstone/Data'),
                meta:      {
                    admin: true,
                },
            },
        ],
    },
];

export default routes;
