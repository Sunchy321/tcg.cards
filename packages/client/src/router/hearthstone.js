const routes = [
    {
        path: '/hearthstone',
        component: () => import('layouts/Main.vue'),
        children: [
            {
                path: '',
                component: () => import('pages/hearthstone/Index'),
                meta: {
                    title: 'hearthstone.$self',
                },
            },

            {
                path: 'hsdata',
                component: () => import('pages/hearthstone/admin/Hsdata'),
                meta: {
                    requireAdmin: true,
                    title: 'hearthstone.hsdata.$self',
                },
            },
        ],
    },
];

export default routes;
