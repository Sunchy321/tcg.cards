/** Shared settings links retain the former desktop navigation labels and icons. */
export const generalSettings = [
  { label: '数据库', buttonLabel: '数据库设置', icon: 'i-lucide-database', to: '/settings/database' },
  { label: '数据目录', buttonLabel: '数据目录设置', icon: 'i-lucide-folder-tree', to: '/settings/data-source' },
  { label: '模型配置', buttonLabel: '模型配置', icon: 'i-lucide-sparkles', to: '/settings/model' },
  { label: '发布配置', buttonLabel: '发布配置', icon: 'i-lucide-upload', to: '/settings/publish' },
  { label: '远端登录', buttonLabel: '远端登录', icon: 'i-lucide-log-in', to: '/settings/remote' },
];

/** Game settings links retain the existing labels and icons. */
export const gameSettings = [
  { label: 'Magic', buttonLabel: 'Magic 设置', icon: 'i:magic-logo', to: '/settings/games/magic' },
  { label: 'Hearthstone', buttonLabel: 'Hearthstone 设置', icon: 'i:hearthstone-logo', to: '/settings/games/hearthstone' },
  { label: 'Yu-Gi-Oh!', buttonLabel: 'Yu-Gi-Oh! 设置', icon: 'i:yugioh-logo', to: '/settings/games/yugioh' },
  { label: 'Shadowverse', buttonLabel: 'Shadowverse 设置', icon: 'i-lucide-sparkles', to: '/settings/games/shadowverse' },
];
