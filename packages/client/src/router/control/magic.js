const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      'control/get-bulk',
                component: () => import('pages/magic/GetBulk')
            },
        ]
    },
];

export default routes;
