const routes = [
    {
        path:      '/magic',
        component: () => import('layouts/Main.vue'),
        children:  [
            {
                path:      '',
                component: () => import('pages/magic/Index'),
                meta:      {
                    title: 'magic.$self',
                },
            },
            {
                path:      'data',
                component: () => import('pages/magic/Data'),
                meta:      {
                    requireAdmin: true,
                    title:        'data',
                },
            },
            {
                path:      'format',
                component: () => import('pages/magic/Format'),
            },
            {
                path:      'format-change',
                component: () => import('pages/magic/FormatChange'),
            },
            {
                path:      'set',
                component: () => import('pages/magic/Set'),
            },
            {
                path:      'card',
                component: () => import('pages/magic/Card'),
            },
        ],
    },
];

export default routes;
