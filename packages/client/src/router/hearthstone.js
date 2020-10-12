const routes = [
    {
        path:      '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/hearthstone/Index'),
                meta:      {
                    title: 'hearthstone.$self',
                },
            },

            {
                path:      'data',
                component: () => import('pages/hearthstone/Data'),
                meta:      {
                    requireAdmin: true,
                    title:        'hearthstone.hsdata.$self',
                },
            },
        ],
    },
];

export default routes;
